import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "@notionhq/client";
import { readContext, writeContext } from "../lib/context.js";

const POSTHOG_HOST = "https://eu.posthog.com";
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

const notion = new Client({ auth: NOTION_API_KEY });

// --- PostHog helpers ---

async function posthogGet(path) {
  const res = await fetch(`${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}${path}`, {
    headers: { Authorization: `Bearer ${POSTHOG_API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog GET ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function posthogQuery(query) {
  const res = await fetch(`${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${POSTHOG_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog query failed (${res.status}): ${text}`);
  }
  return res.json();
}

// --- Fetch experiments and results ---

async function fetchExperiments() {
  const data = await posthogGet("/experiments/");
  return data.results.filter((e) => !e.archived && !e.deleted);
}

async function fetchExperimentResults(experiment) {
  const results = [];

  for (const metric of experiment.metrics) {
    try {
      const data = await posthogQuery({
        kind: "ExperimentQuery",
        experiment_id: experiment.id,
        metric,
      });
      results.push({ metric, data });
    } catch (err) {
      console.warn(`  Warning: Could not fetch results for metric ${metric.uuid}: ${err.message}`);
    }
  }

  return results;
}

// --- Analysis ---

function analyzeExperiment(experiment, metricResults) {
  const startDate = new Date(experiment.start_date);
  const daysRunning = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const variants = experiment.parameters?.feature_flag_variants || [];

  const analysis = {
    name: experiment.name,
    id: experiment.id,
    flagKey: experiment.feature_flag_key,
    startDate: startDate.toISOString().split("T")[0],
    daysRunning,
    variants: variants.map((v) => `${v.key} (${v.rollout_percentage}%)`),
    metrics: [],
    recommendation: null,
  };

  for (const { metric, data } of metricResults) {
    const baseline = data.baseline || {};
    const variantResults = data.variant_results || [];
    const hasValidationFailures =
      baseline.validation_failures?.length > 0 ||
      variantResults.some((v) => v.validation_failures?.length > 0);

    const metricAnalysis = {
      type: metric.metric_type,
      goal: metric.goal,
      significant: data.significant,
      significanceCode: data.significance_code,
      pValue: data.p_value,
      baselineSamples: baseline.number_of_samples || 0,
      hasEnoughData: !hasValidationFailures,
      variants: [],
    };

    for (const vr of variantResults) {
      metricAnalysis.variants.push({
        key: vr.key,
        samples: vr.number_of_samples || 0,
        chanceToWin: vr.chance_to_win,
        credibleInterval: vr.credible_interval,
        significant: vr.significant,
      });
    }

    analysis.metrics.push(metricAnalysis);
  }

  // Determine recommendation
  const primaryMetric = analysis.metrics[0];

  if (!primaryMetric || !primaryMetric.hasEnoughData) {
    const totalSamples = primaryMetric
      ? primaryMetric.baselineSamples + primaryMetric.variants.reduce((s, v) => s + v.samples, 0)
      : 0;
    const dailyRate = daysRunning > 0 ? totalSamples / daysRunning : 0;
    // PostHog typically needs ~100+ samples per variant for Bayesian significance
    const samplesNeeded = Math.max(0, 200 - totalSamples);
    const daysRemaining = dailyRate > 0 ? Math.ceil(samplesNeeded / dailyRate) : null;

    analysis.recommendation = {
      action: "wait",
      reason: "Not enough data yet",
      totalSamples,
      dailyRate: Math.round(dailyRate * 10) / 10,
      estimatedDaysRemaining: daysRemaining,
    };
  } else if (primaryMetric.significant === true) {
    // Check if the test variant is winning
    const testVariant = primaryMetric.variants.find((v) => v.key !== "control");
    const isPositive = testVariant?.chanceToWin != null && testVariant.chanceToWin > 0.5;

    if (isPositive) {
      analysis.recommendation = {
        action: "ramp",
        reason: `Statistically significant positive result. Test variant has ${Math.round((testVariant.chanceToWin || 0) * 100)}% chance to win.`,
        chanceToWin: testVariant.chanceToWin,
      };
    } else {
      analysis.recommendation = {
        action: "rollback",
        reason: `Statistically significant negative result. Control is winning with ${Math.round(((1 - (testVariant?.chanceToWin || 0)) * 100))}% chance.`,
        chanceToWin: testVariant?.chanceToWin,
      };
    }
  } else {
    // Has data but not yet significant
    const totalSamples =
      primaryMetric.baselineSamples + primaryMetric.variants.reduce((s, v) => s + v.samples, 0);
    const dailyRate = daysRunning > 0 ? totalSamples / daysRunning : 0;
    const daysRemaining = dailyRate > 0 ? Math.ceil(Math.max(0, 500 - totalSamples) / dailyRate) : null;

    analysis.recommendation = {
      action: "wait",
      reason: "Has data but not yet statistically significant",
      totalSamples,
      dailyRate: Math.round(dailyRate * 10) / 10,
      estimatedDaysRemaining: daysRemaining,
    };
  }

  return analysis;
}

// --- Report formatting ---

function formatReport(analyses) {
  const lines = ["Experiment Monitor Report", "═".repeat(50), ""];

  for (const a of analyses) {
    lines.push(`Experiment: ${a.name}`);
    lines.push(`  Flag: ${a.flagKey}`);
    lines.push(`  Running since: ${a.startDate} (${a.daysRunning} days)`);
    lines.push(`  Variants: ${a.variants.join(", ")}`);
    lines.push("");

    for (const m of a.metrics) {
      lines.push(`  Metric (${m.type}, goal: ${m.goal}):`);
      lines.push(`    Enough data: ${m.hasEnoughData ? "Yes" : "No"}`);
      lines.push(`    Significant: ${m.significant ?? "N/A"}`);
      if (m.significanceCode) lines.push(`    Significance code: ${m.significanceCode}`);
      if (m.pValue != null) lines.push(`    p-value: ${m.pValue}`);
      for (const v of m.variants) {
        const win = v.chanceToWin != null ? ` (${Math.round(v.chanceToWin * 100)}% chance to win)` : "";
        lines.push(`    Variant "${v.key}": ${v.samples} samples${win}`);
      }
      lines.push("");
    }

    const rec = a.recommendation;
    if (rec.action === "ramp") {
      lines.push(`  → RECOMMENDATION: Ramp to 100%`);
      lines.push(`    ${rec.reason}`);
    } else if (rec.action === "rollback") {
      lines.push(`  → RECOMMENDATION: Roll back`);
      lines.push(`    ${rec.reason}`);
    } else {
      lines.push(`  → RECOMMENDATION: Keep running`);
      lines.push(`    ${rec.reason}`);
      if (rec.totalSamples != null) lines.push(`    Total samples: ${rec.totalSamples}`);
      if (rec.dailyRate) lines.push(`    Daily sample rate: ~${rec.dailyRate}/day`);
      if (rec.estimatedDaysRemaining != null) {
        lines.push(`    Estimated days to significance: ~${rec.estimatedDaysRemaining}`);
      } else {
        lines.push(`    Estimated days to significance: unknown (no traffic yet)`);
      }
    }

    lines.push("");
    lines.push("─".repeat(50));
    lines.push("");
  }

  return lines.join("\n");
}

// --- Notion writer ---

async function writeToNotion(analysis, report) {
  const rec = analysis.recommendation;
  const statusEmoji =
    rec.action === "ramp" ? "✅" : rec.action === "rollback" ? "🔴" : "⏳";
  const statusText =
    rec.action === "ramp"
      ? "Ramp to 100%"
      : rec.action === "rollback"
        ? "Roll back"
        : "Keep running";

  const children = [
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ text: { content: "Recommendation" } }],
      },
    },
    {
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: statusEmoji },
        rich_text: [{ text: { content: `${statusText}: ${rec.reason}` } }],
      },
    },
  ];

  if (rec.action === "wait") {
    const details = [];
    if (rec.totalSamples != null) details.push(`Total samples: ${rec.totalSamples}`);
    if (rec.dailyRate) details.push(`Daily rate: ~${rec.dailyRate}/day`);
    if (rec.estimatedDaysRemaining != null) {
      details.push(`Est. days remaining: ~${rec.estimatedDaysRemaining}`);
    }
    if (details.length > 0) {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ text: { content: details.join(" · ") } }],
        },
      });
    }
  }

  children.push(
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ text: { content: "Full Report" } }],
      },
    },
    {
      object: "block",
      type: "code",
      code: {
        rich_text: [{ text: { content: report } }],
        language: "plain text",
      },
    }
  );

  await notion.pages.create({
    parent: { database_id: NOTION_DATABASE_ID },
    properties: {
      Title: {
        title: [
          {
            text: {
              content: `${statusEmoji} ${analysis.name} — ${statusText}`,
            },
          },
        ],
      },
      Week: {
        rich_text: [
          {
            text: {
              content: new Date().toISOString().split("T")[0],
            },
          },
        ],
      },
    },
    children,
  });
}

// --- Main ---

async function experimentMonitor() {
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    throw new Error("Missing POSTHOG_API_KEY or POSTHOG_PROJECT_ID in .env.local");
  }
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    throw new Error("Missing NOTION_API_KEY or NOTION_DATABASE_ID in .env.local");
  }

  console.log("Fetching experiments from PostHog...");
  const experiments = await fetchExperiments();

  if (experiments.length === 0) {
    console.log("No active experiments found.");
    process.exit(0);
  }

  console.log(`Found ${experiments.length} active experiment(s).\n`);

  const analyses = [];
  for (const exp of experiments) {
    console.log(`Analyzing: ${exp.name} (${exp.feature_flag_key})...`);
    const metricResults = await fetchExperimentResults(exp);
    const analysis = analyzeExperiment(exp, metricResults);
    analyses.push(analysis);
  }

  const report = formatReport(analyses);
  console.log("\n" + report);

  // Write concluded or significant experiments to Notion
  const conclusive = analyses.filter(
    (a) => a.recommendation.action === "ramp" || a.recommendation.action === "rollback"
  );
  const inconclusive = analyses.filter((a) => a.recommendation.action === "wait");

  if (conclusive.length > 0) {
    console.log(`Writing ${conclusive.length} conclusive experiment(s) to Notion...`);
    for (const a of conclusive) {
      await writeToNotion(a, report);
    }
    console.log("Done.");
  } else {
    console.log("No experiments have reached significance yet.");
  }

  // Always log a status update for inconclusive ones
  if (inconclusive.length > 0) {
    console.log(`\nWriting status update for ${inconclusive.length} running experiment(s) to Notion...`);
    for (const a of inconclusive) {
      await writeToNotion(a, report);
    }
    console.log("Done.");
  }

  // Update shared context with experiment statuses
  const ctx = readContext();

  for (const a of analyses) {
    const existing = ctx.experiments.find((e) => e.flagKey === a.flagKey);
    const entry = {
      id: `exp-${a.id}`,
      hypothesisId: null,
      flagKey: a.flagKey,
      name: a.name,
      startedAt: a.startDate,
      status: a.recommendation.action === "ramp" ? "concluded"
        : a.recommendation.action === "rollback" ? "rolled-back"
        : "running",
      recommendation: a.recommendation.action,
      endedAt: a.recommendation.action !== "wait" ? new Date().toISOString().split("T")[0] : null,
      result: {
        winner: a.recommendation.action === "ramp" ? "test" : a.recommendation.action === "rollback" ? "control" : null,
        pValue: a.metrics[0]?.pValue ?? null,
        sampleSize: a.metrics[0]
          ? a.metrics[0].baselineSamples + a.metrics[0].variants.reduce((s, v) => s + v.samples, 0)
          : null,
      },
    };

    if (existing) {
      Object.assign(existing, entry);
    } else {
      ctx.experiments.push(entry);
    }
  }

  writeContext(ctx);
  console.log("Updated shared context.");

  process.exit(0);
}

experimentMonitor().catch((err) => {
  console.error("Experiment monitor failed:", err);
  process.exit(1);
});

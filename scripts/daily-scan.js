import { config } from "dotenv";
config({ path: ".env.local" });

import { readContext, writeContext } from "../lib/context.js";

const POSTHOG_HOST = "https://eu.posthog.com";
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;

// --- PostHog helper ---

async function posthogQuery(query) {
  const res = await fetch(
    `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${POSTHOG_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog query failed (${res.status}): ${text}`);
  }

  return res.json();
}

// --- Health check ---

async function fetchDailyMetrics() {
  const eventCounts = await posthogQuery(`
    SELECT event, count() as cnt
    FROM events
    WHERE timestamp >= now() - interval 1 day
      AND event IN ('$pageview', 'vote_cast', 'results_viewed', 'share_clicked')
    GROUP BY event
    ORDER BY cnt DESC
  `);

  const sessionCount = await posthogQuery(`
    SELECT count(distinct $session_id) as sessions
    FROM events
    WHERE timestamp >= now() - interval 1 day
      AND event = '$pageview'
  `);

  const returnRate = await posthogQuery(`
    SELECT
      countIf(pv_count > 1) as returning_sessions,
      count() as total_sessions,
      round(countIf(pv_count > 1) / count() * 100, 1) as return_pct
    FROM (
      SELECT $session_id, count() as pv_count
      FROM events
      WHERE timestamp >= now() - interval 1 day
        AND event = '$pageview'
      GROUP BY $session_id
    )
  `);

  const uniqueVoters = await posthogQuery(`
    SELECT count(distinct $session_id) as unique_voters
    FROM events
    WHERE timestamp >= now() - interval 1 day
      AND event = 'vote_cast'
  `);

  const counts = {};
  for (const row of eventCounts.results || []) {
    counts[row[0]] = row[1];
  }

  const pageviews = counts["$pageview"] || 0;
  const votes = counts["vote_cast"] || 0;
  const shares = counts["share_clicked"] || 0;
  const sessions = sessionCount.results?.[0]?.[0] || 0;

  return {
    date: new Date().toISOString().split("T")[0],
    pageviews,
    votes,
    shares,
    sessions,
    uniqueVoters: uniqueVoters.results?.[0]?.[0] || 0,
    voteCompletionRate: pageviews > 0 ? Math.round((votes / pageviews) * 1000) / 10 : 0,
    returnRate: returnRate.results?.[0]?.[2] || 0,
    shareConversion: votes > 0 ? Math.round((shares / votes) * 1000) / 10 : 0,
  };
}

function checkAnomalies(metrics, ctx) {
  const anomalies = [];
  const pulse = ctx.dailyPulse || [];

  // Need at least 3 days of data for a meaningful baseline
  if (pulse.length < 3) return anomalies;

  const recent = pulse.slice(-7);
  const fields = [
    "pageviews", "votes", "sessions",
    "voteCompletionRate", "returnRate", "shareConversion",
  ];

  for (const field of fields) {
    const avg = recent.reduce((sum, p) => sum + (p[field] || 0), 0) / recent.length;
    if (avg === 0) continue;
    const deviation = ((metrics[field] - avg) / avg) * 100;
    if (Math.abs(deviation) > 20) {
      const sign = deviation > 0 ? "+" : "";
      anomalies.push(
        `ANOMALY: ${field} = ${metrics[field]} (avg ${Math.round(avg)}, ${sign}${deviation.toFixed(1)}%)`
      );
    }
  }

  return anomalies;
}

// --- Experiment pipeline ---

function checkExperimentPipeline(ctx) {
  const messages = [];
  const today = new Date().toISOString().split("T")[0];

  // Check for running experiments
  const running = (ctx.experiments || []).filter((e) => e.status === "running");
  if (running.length > 0) {
    for (const e of running) {
      messages.push(`Experiment running: ${e.name || e.flagKey} (since ${e.startedAt})`);
    }
    messages.push("Next significance check by experiment-monitor at 9:00 AM UTC.");
    return { status: "experiment-running", messages };
  }

  // Check for experiments that concluded today — update linked hypotheses
  const justConcluded = (ctx.experiments || []).filter(
    (e) => (e.status === "concluded" || e.status === "rolled-back") && e.endedAt === today
  );

  for (const e of justConcluded) {
    if (!e.hypothesisId) {
      messages.push(
        `WARNING: ${e.name || e.flagKey} concluded but has no hypothesisId link. Update context.json manually.`
      );
      continue;
    }
    const hyp = ctx.hypotheses.find((h) => h.id === e.hypothesisId);
    if (hyp && hyp.status === "running") {
      hyp.status = "concluded";
      hyp.result = e.result?.winner || null;
      hyp.metrics = e.result || {};
      messages.push(
        `Experiment ${e.name || e.flagKey} ${e.status}. Updated hypothesis ${hyp.id} to concluded.`
      );
    }
  }

  // Find next ready hypothesis
  const readyHypotheses = (ctx.hypotheses || []).filter((h) => {
    if (h.status !== "proposed") return false;
    if (!h.dependsOn) return true;
    const deps = Array.isArray(h.dependsOn) ? h.dependsOn : [h.dependsOn];
    return deps.every((depId) => {
      const dep = ctx.hypotheses.find((d) => d.id === depId);
      return dep && dep.status === "concluded";
    });
  });

  if (readyHypotheses.length > 0) {
    const next = readyHypotheses[0];
    messages.push("");
    messages.push("NEXT HYPOTHESIS READY");
    messages.push("\u2500".repeat(30));
    messages.push(`ID:        ${next.id}`);
    messages.push(`Statement: ${next.statement}`);
    messages.push(`Target:    ${next.targetGoal || "—"}`);
    messages.push(
      "Action:    Create PostHog experiment with feature flag, then link experimentId in context.json"
    );

    // Show design notes if available
    if (next.designNotes) {
      messages.push("");
      messages.push("Design notes:");
      for (const [key, val] of Object.entries(next.designNotes)) {
        messages.push(`  ${key}: ${val}`);
      }
    }

    // List blocked hypotheses
    const blocked = (ctx.hypotheses || []).filter((h) => {
      if (h.status !== "proposed" || !h.dependsOn) return false;
      const deps = Array.isArray(h.dependsOn) ? h.dependsOn : [h.dependsOn];
      return !deps.every((depId) => {
        const dep = ctx.hypotheses.find((d) => d.id === depId);
        return dep && dep.status === "concluded";
      });
    });

    if (blocked.length > 0) {
      messages.push("");
      messages.push("Blocked hypotheses:");
      for (const b of blocked) {
        const deps = Array.isArray(b.dependsOn) ? b.dependsOn : [b.dependsOn];
        const depStatus = deps
          .map((id) => {
            const d = ctx.hypotheses.find((h) => h.id === id);
            return `${id} (${d ? d.status : "missing"})`;
          })
          .join(", ");
        messages.push(`  ${b.id} \u2014 depends on ${depStatus}`);
      }
    }

    return { status: "recommendation", messages };
  }

  // Nothing ready
  messages.push("No hypotheses ready to run.");

  const blocked = (ctx.hypotheses || []).filter((h) => {
    if (h.status !== "proposed" || !h.dependsOn) return false;
    return true;
  });

  if (blocked.length > 0) {
    messages.push("");
    messages.push("Blocked hypotheses:");
    for (const b of blocked) {
      const deps = Array.isArray(b.dependsOn) ? b.dependsOn : [b.dependsOn];
      const depStatus = deps
        .map((id) => {
          const d = ctx.hypotheses.find((h) => h.id === id);
          return `${id} (${d ? d.status : "missing"})`;
        })
        .join(", ");
      messages.push(`  ${b.id} \u2014 depends on ${depStatus}`);
    }
  }

  return { status: "idle", messages };
}

// --- Daily pulse ---

function writeDailyPulse(ctx, metrics, anomalies) {
  if (!ctx.dailyPulse) ctx.dailyPulse = [];

  ctx.dailyPulse.push({
    date: metrics.date,
    pageviews: metrics.pageviews,
    votes: metrics.votes,
    sessions: metrics.sessions,
    uniqueVoters: metrics.uniqueVoters,
    voteCompletionRate: metrics.voteCompletionRate,
    returnRate: metrics.returnRate,
    shareConversion: metrics.shareConversion,
    anomalies: anomalies.length > 0 ? anomalies : null,
  });

  // Keep 90 days of history
  while (ctx.dailyPulse.length > 90) ctx.dailyPulse.shift();
}

// --- Main ---

async function dailyScan() {
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    throw new Error("Missing POSTHOG_API_KEY or POSTHOG_PROJECT_ID in .env.local");
  }

  const today = new Date().toISOString().split("T")[0];
  console.log(`\nDaily Scan \u2014 ${today}`);
  console.log("\u2550".repeat(40));

  // 1. Health check
  console.log("\n[1/3] Health Check (last 24h)");
  console.log("\u2500".repeat(40));
  const metrics = await fetchDailyMetrics();
  console.log(`  Pageviews:       ${metrics.pageviews}`);
  console.log(`  Votes:           ${metrics.votes}`);
  console.log(`  Sessions:        ${metrics.sessions}`);
  console.log(`  Unique voters:   ${metrics.uniqueVoters}`);
  console.log(`  Completion rate: ${metrics.voteCompletionRate}%`);
  console.log(`  Return rate:     ${metrics.returnRate}%`);
  console.log(`  Share conv.:     ${metrics.shareConversion}%`);

  const ctx = readContext();
  const anomalies = checkAnomalies(metrics, ctx);
  if (anomalies.length > 0) {
    console.log("");
    anomalies.forEach((a) => console.log(`  ${a}`));
  } else if ((ctx.dailyPulse || []).length < 3) {
    console.log("\n  Not enough historical data for anomaly detection (need 3+ days).");
  } else {
    console.log("\n  All metrics within normal range.");
  }

  // 2. Experiment pipeline
  console.log("\n[2/3] Experiment Pipeline");
  console.log("\u2500".repeat(40));
  const pipeline = checkExperimentPipeline(ctx);
  pipeline.messages.forEach((m) => console.log(`  ${m}`));

  // 3. Daily pulse
  console.log("\n[3/3] Daily Pulse");
  console.log("\u2500".repeat(40));
  writeDailyPulse(ctx, metrics, anomalies);
  writeContext(ctx);
  console.log(`  Recorded pulse for ${today}. Total entries: ${ctx.dailyPulse.length}`);

  // One-line summary
  const flag = anomalies.length > 0 ? "(!)" : "(ok)";
  const expStatus =
    pipeline.status === "experiment-running"
      ? "exp running"
      : pipeline.status === "recommendation"
        ? "next hyp ready"
        : "no exp";
  console.log(
    `\n${flag} ${today}: ${metrics.votes} votes, ${metrics.voteCompletionRate}% completion, ${metrics.returnRate}% return | ${expStatus}`
  );

  process.exit(0);
}

dailyScan().catch((err) => {
  console.error("Daily scan failed:", err);
  process.exit(1);
});

import { config } from "dotenv";
config({ path: ".env.local" });

import { readContext, writeContext } from "../lib/context.js";

const POSTHOG_HOST = "https://eu.posthog.com";
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;

// Experiment definitions, keyed by hypothesis id (see data/context.json).
//
// Metric rules:
// - Primary and secondary metrics must be measurable in BOTH variants. An event that only
//   exists in the test variant (e.g. dilemma_liked, since control has no like button) always
//   has a zero baseline and can never reach significance, so it is a secondary metric at best.
// - Use ExperimentMetric (the current format). Primary metrics go in `metrics`, secondary
//   ones in `metrics_secondary`. `secondary_metrics` is a legacy field that is never queried.
const event = (name) => ({ kind: "EventsNode", event: name });

const SPECS = {
  "hyp-manual-001": {
    name: "Like Button",
    flagKey: "like-button",
    metrics: [
      // Engagement depth, available in both variants
      { kind: "ExperimentMetric", metric_type: "mean", name: "Votes Cast", source: event("vote_cast"), goal: "increase" },
    ],
    metricsSecondary: [
      // Test-variant only: informative for like rate, not usable as a comparison
      { kind: "ExperimentMetric", metric_type: "mean", name: "Dilemma Liked", source: event("dilemma_liked"), goal: "increase" },
      { kind: "ExperimentMetric", metric_type: "mean", name: "Dilemmas Loaded", source: event("question_loaded"), goal: "increase" },
    ],
  },
  "hyp-exp-001": {
    name: "Next Dilemma Teaser",
    flagKey: "next-dilemma-teaser",
    metrics: [
      // Hypothesis: keep_going_clicked / results_viewed
      {
        kind: "ExperimentMetric",
        metric_type: "ratio",
        name: "Keep Going Rate",
        numerator: event("keep_going_clicked"),
        denominator: event("results_viewed"),
        goal: "increase",
      },
    ],
    metricsSecondary: [
      { kind: "ExperimentMetric", metric_type: "mean", name: "Dilemmas Loaded", source: event("question_loaded"), goal: "increase" },
    ],
  },
};

async function posthog(method, path, body) {
  const res = await fetch(`${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${POSTHOG_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog ${method} ${path} failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function launch(hypothesisId) {
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    throw new Error("Missing POSTHOG_API_KEY or POSTHOG_PROJECT_ID in .env.local");
  }

  const spec = SPECS[hypothesisId];
  if (!spec) {
    throw new Error(`Unknown hypothesis "${hypothesisId}". Known: ${Object.keys(SPECS).join(", ")}`);
  }

  const today = new Date().toISOString().split("T")[0];
  const experimentName = `${spec.name} — ${hypothesisId}`;

  // Step 1: Create feature flag (reuse it if it already exists, so users keep their variant)
  console.log(`Checking for existing feature flag '${spec.flagKey}'...`);
  const flags = await posthog("GET", `/feature_flags/?search=${spec.flagKey}`);
  const existingFlag = flags.results?.find((f) => f.key === spec.flagKey && !f.deleted);

  let flagId;
  if (existingFlag) {
    flagId = existingFlag.id;
    console.log(`  Flag already exists, ID: ${flagId}`);
  } else {
    console.log(`  Creating feature flag '${spec.flagKey}'...`);
    const flag = await posthog("POST", "/feature_flags/", {
      key: spec.flagKey,
      name: `${spec.name} Experiment`,
      filters: {
        groups: [{ variant: null, rollout_percentage: 100 }],
        multivariate: {
          variants: [
            { key: "control", rollout_percentage: 50 },
            { key: "test", rollout_percentage: 50 },
          ],
        },
      },
      active: true,
    });
    flagId = flag.id;
    console.log(`  Created flag ID: ${flagId}, key: ${flag.key}`);
  }

  // Step 2: Create experiment
  console.log("Creating experiment...");
  const experiment = await posthog("POST", "/experiments/", {
    name: experimentName,
    feature_flag_key: spec.flagKey,
    start_date: `${today}T00:00:00Z`,
    parameters: {},
    metrics: spec.metrics,
    metrics_secondary: spec.metricsSecondary,
  });
  console.log(`  Created experiment ID: ${experiment.id}, name: ${experiment.name}`);

  // Step 3: Update context.json (replace any earlier entry for this hypothesis)
  console.log("Updating context.json...");
  const ctx = readContext();

  const hyp = ctx.hypotheses.find((h) => h.id === hypothesisId);
  if (hyp) {
    hyp.status = "running";
    hyp.experimentId = `exp-${experiment.id}`;
  } else {
    console.warn(`  WARNING: ${hypothesisId} not found in context.json`);
  }

  ctx.experiments = ctx.experiments.filter((e) => e.hypothesisId !== hypothesisId);
  ctx.experiments.push({
    id: `exp-${experiment.id}`,
    hypothesisId,
    flagKey: spec.flagKey,
    name: experimentName,
    startedAt: today,
    status: "running",
    recommendation: "wait",
    endedAt: null,
    result: { winner: null, pValue: null, sampleSize: null },
  });

  writeContext(ctx);
  console.log("  Updated hypothesis status to 'running' and added experiment entry.");

  console.log("\nExperiment launched successfully!");
  console.log(`  PostHog experiment: ${POSTHOG_HOST}/project/${POSTHOG_PROJECT_ID}/experiments/${experiment.id}`);
  console.log(`  Feature flag: ${POSTHOG_HOST}/project/${POSTHOG_PROJECT_ID}/feature_flags/${flagId}`);

  process.exit(0);
}

const hypothesisId = process.argv[2];
if (!hypothesisId) {
  console.error(`Usage: tsx scripts/launch-experiment.js <hypothesisId>\nKnown: ${Object.keys(SPECS).join(", ")}`);
  process.exit(1);
}

launch(hypothesisId).catch((err) => {
  console.error("Launch failed:", err);
  process.exit(1);
});

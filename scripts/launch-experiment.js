import { config } from "dotenv";
config({ path: ".env.local" });

import { readContext, writeContext } from "../lib/context.js";

const POSTHOG_HOST = "https://eu.posthog.com";
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;

async function posthogPost(path, body) {
  const res = await fetch(
    `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${POSTHOG_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog POST ${path} failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function launch() {
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    throw new Error("Missing POSTHOG_API_KEY or POSTHOG_PROJECT_ID in .env.local");
  }

  const today = new Date().toISOString().split("T")[0];

  // Step 1: Create feature flag (skip if it already exists)
  let flagId;
  console.log("Checking for existing feature flag 'like-button'...");
  const flagsRes = await fetch(
    `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/?search=like-button`,
    {
      headers: { Authorization: `Bearer ${POSTHOG_API_KEY}` },
    }
  );
  const flagsData = await flagsRes.json();
  const existingFlag = flagsData.results?.find((f) => f.key === "like-button");

  if (existingFlag) {
    flagId = existingFlag.id;
    console.log(`  Flag already exists, ID: ${flagId}`);
  } else {
    console.log("  Creating feature flag 'like-button'...");
    const flag = await posthogPost("/feature_flags/", {
      key: "like-button",
      name: "Like Button Experiment",
      filters: {
        groups: [
          {
            variant: null,
            rollout_percentage: 100,
          },
        ],
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
  const experiment = await posthogPost("/experiments/", {
    name: "Like Button \u2014 hyp-manual-001",
    feature_flag_key: "like-button",
    start_date: `${today}T00:00:00Z`,
    parameters: {},
    metrics: [
      {
        kind: "ExperimentMetric",
        metric_type: "mean",
        name: "Dilemma Liked",
        source: { kind: "EventsNode", event: "dilemma_liked" },
        goal: "increase",
      },
    ],
    secondary_metrics: [
      {
        kind: "ExperimentMetric",
        metric_type: "mean",
        name: "Votes Cast",
        source: { kind: "EventsNode", event: "vote_cast" },
        goal: "increase",
      },
    ],
  });
  console.log(`  Created experiment ID: ${experiment.id}, name: ${experiment.name}`);

  // Step 3: Update context.json
  console.log("Updating context.json...");
  const ctx = readContext();

  const hyp = ctx.hypotheses.find((h) => h.id === "hyp-manual-001");
  if (hyp) {
    hyp.status = "running";
    hyp.experimentId = `exp-${experiment.id}`;
  } else {
    console.warn("  WARNING: hyp-manual-001 not found in context.json");
  }

  ctx.experiments.push({
    id: `exp-${experiment.id}`,
    hypothesisId: "hyp-manual-001",
    flagKey: "like-button",
    name: "Like Button \u2014 hyp-manual-001",
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

launch().catch((err) => {
  console.error("Launch failed:", err);
  process.exit(1);
});

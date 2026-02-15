import { config } from "dotenv";
config({ path: ".env.local" });

const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;

const POSTHOG_HOST = "https://eu.posthog.com";
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO;
const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM || "watchdog@resend.dev";

const ERROR_THRESHOLD = parseInt(process.env.ERROR_THRESHOLD || "50", 10);

// --- Sentry ---

async function getErrorCount() {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const params = new URLSearchParams({
    statsPeriod: "1h",
    query: "is:unresolved",
    sort: "freq",
  });

  const res = await fetch(
    `https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?${params}`,
    {
      headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentry API failed (${res.status}): ${text}`);
  }

  const issues = await res.json();

  // Sum up event counts from the last hour across all issues
  let totalEvents = 0;
  for (const issue of issues) {
    totalEvents += parseInt(issue.count || "0", 10);
  }

  return { totalEvents, issueCount: issues.length };
}

// --- PostHog ---

async function getFeatureFlags() {
  const res = await fetch(
    `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/?limit=100`,
    {
      headers: { Authorization: `Bearer ${POSTHOG_API_KEY}` },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog feature flags GET failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.results.filter((f) => f.active && !f.deleted);
}

async function disableFeatureFlag(flag) {
  const res = await fetch(
    `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/${flag.id}/`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${POSTHOG_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ active: false }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog flag disable failed for "${flag.key}" (${res.status}): ${text}`);
  }

  return res.json();
}

// --- Email ---

async function sendAlertEmail(errorCount, issueCount, disabledFlags) {
  if (!RESEND_API_KEY || !ALERT_EMAIL_TO) {
    console.warn("  Skipping email: RESEND_API_KEY or ALERT_EMAIL_TO not set");
    return;
  }

  const flagList = disabledFlags.length > 0
    ? disabledFlags.map((f) => `  - ${f.key}`).join("\n")
    : "  (none active)";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ALERT_EMAIL_FROM,
      to: [ALERT_EMAIL_TO],
      subject: `🚨 Daily Dilemma Watchdog: ${errorCount} errors in the last hour`,
      text: [
        `Watchdog Alert — ${new Date().toISOString()}`,
        ``,
        `${errorCount} error events across ${issueCount} issues in the last hour (threshold: ${ERROR_THRESHOLD}).`,
        ``,
        `The following feature flags have been disabled:`,
        flagList,
        ``,
        `Review errors: https://sentry.io/organizations/${SENTRY_ORG}/issues/?project=${SENTRY_PROJECT}&statsPeriod=1h`,
        `Re-enable flags: ${POSTHOG_HOST}/project/${POSTHOG_PROJECT_ID}/feature_flags`,
      ].join("\n"),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend email failed (${res.status}): ${text}`);
  }

  console.log(`  Alert email sent to ${ALERT_EMAIL_TO}`);
}

// --- Main ---

async function watchdog() {
  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) {
    throw new Error("Missing SENTRY_AUTH_TOKEN, SENTRY_ORG, or SENTRY_PROJECT in env");
  }
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    throw new Error("Missing POSTHOG_API_KEY or POSTHOG_PROJECT_ID in env");
  }

  console.log(`Checking Sentry for errors (threshold: ${ERROR_THRESHOLD})...`);
  const { totalEvents, issueCount } = await getErrorCount();
  console.log(`  ${totalEvents} error events across ${issueCount} issues in the last hour`);

  if (totalEvents < ERROR_THRESHOLD) {
    console.log("  Below threshold — all clear.");
    process.exit(0);
  }

  console.log(`  ⚠ Threshold exceeded! Disabling feature flags...`);

  const flags = await getFeatureFlags();
  console.log(`  Found ${flags.length} active feature flag(s)`);

  const disabledFlags = [];
  for (const flag of flags) {
    try {
      await disableFeatureFlag(flag);
      disabledFlags.push(flag);
      console.log(`  ✓ Disabled: ${flag.key}`);
    } catch (err) {
      console.error(`  ✗ Failed to disable ${flag.key}: ${err.message}`);
    }
  }

  console.log("\nSending alert email...");
  await sendAlertEmail(totalEvents, issueCount, disabledFlags);

  console.log("\nWatchdog complete.");
  process.exit(disabledFlags.length > 0 ? 0 : 1);
}

watchdog().catch((err) => {
  console.error("Watchdog failed:", err);
  process.exit(1);
});

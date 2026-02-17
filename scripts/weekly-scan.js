import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@notionhq/client";
import { readContext, writeContext } from "../lib/context.js";

const POSTHOG_HOST = "https://eu.posthog.com";
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const notion = new Client({ auth: NOTION_API_KEY });

// --- PostHog helpers ---

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

async function fetchAnalytics() {
  // Event counts by type
  const eventCounts = await posthogQuery(`
    SELECT event, count() as cnt
    FROM events
    WHERE timestamp >= now() - interval 7 day
      AND event IN ('$pageview', 'vote_cast', 'results_viewed', 'share_clicked')
    GROUP BY event
    ORDER BY cnt DESC
  `);

  // Unique sessions
  const sessionCount = await posthogQuery(`
    SELECT count(distinct $session_id) as sessions
    FROM events
    WHERE timestamp >= now() - interval 7 day
      AND event = '$pageview'
  `);

  // Return rate: sessions with more than one pageview
  const returnRate = await posthogQuery(`
    SELECT
      countIf(pv_count > 1) as returning_sessions,
      count() as total_sessions,
      round(countIf(pv_count > 1) / count() * 100, 1) as return_pct
    FROM (
      SELECT $session_id, count() as pv_count
      FROM events
      WHERE timestamp >= now() - interval 7 day
        AND event = '$pageview'
      GROUP BY $session_id
    )
  `);

  // Average time to vote
  const avgTimeToVote = await posthogQuery(`
    SELECT
      round(avg(toFloat(properties.time_to_vote_seconds)), 1) as avg_seconds,
      count() as vote_count
    FROM events
    WHERE timestamp >= now() - interval 7 day
      AND event = 'vote_cast'
      AND properties.time_to_vote_seconds IS NOT NULL
  `);

  // Build summary
  const counts = {};
  for (const row of eventCounts.results || []) {
    counts[row[0]] = row[1];
  }

  const pageviews = counts["$pageview"] || 0;
  const votes = counts["vote_cast"] || 0;
  const completionRate = pageviews > 0 ? ((votes / pageviews) * 100).toFixed(1) : "0";

  const sessions = sessionCount.results?.[0]?.[0] || 0;
  const returnPct = returnRate.results?.[0]?.[2] || 0;
  const avgTime = avgTimeToVote.results?.[0]?.[0] || "N/A";

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekRange = `${weekAgo.toISOString().split("T")[0]} → ${today.toISOString().split("T")[0]}`;

  const summary = [
    `Weekly Analytics Report (${weekRange})`,
    `─────────────────────────────────`,
    `Pageviews:            ${pageviews}`,
    `Votes cast:           ${votes}`,
    `Results viewed:       ${counts["results_viewed"] || 0}`,
    `Share clicks:         ${counts["share_clicked"] || 0}`,
    `Unique sessions:      ${sessions}`,
    `Vote completion rate: ${completionRate}%`,
    `Return rate:          ${returnPct}%`,
    `Avg time to vote:     ${avgTime}s`,
  ].join("\n");

  return { summary, weekRange };
}

// --- Claude analysis ---

async function analyzeWithClaude(summary) {
  const ctx = readContext();
  const goals = ctx.goals || {};
  const today = new Date();
  const goalsBlock = Object.entries(goals)
    .map(([key, g]) => {
      let deadlineInfo = "ongoing";
      if (g.deadline) {
        const daysLeft = Math.ceil((new Date(g.deadline) - today) / (1000 * 60 * 60 * 24));
        deadlineInfo = daysLeft <= 0
          ? `OVERDUE (was ${g.deadline})`
          : daysLeft <= 7
            ? `⚠️ ${daysLeft} days remaining (${g.deadline})`
            : `${daysLeft} days remaining (${g.deadline})`;
      }
      return `- ${key}: target ${g.target}${g.unit} — ${deadlineInfo} (metric: ${g.metric})`;
    })
    .join("\n");

  const prevMetrics = ctx.weeklyMetrics.slice(-4);
  const trendsBlock = prevMetrics.length > 0
    ? `\n\nPrevious weeks for trend comparison:\n${prevMetrics.map((m) => `  ${m.weekOf}: ${m.sessions} sessions, ${m.votes} votes, ${m.completionRate}% completion, ${m.returnRate}% return, ${m.shares} shares`).join("\n")}`
    : "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a product analytics expert. Analyze the following weekly analytics data for a "Daily Dilemma" polling app where users vote on fun dilemma questions.

${summary}${trendsBlock}

The team has these SMART goals:
${goalsBlock}

Based on this data and these goals, identify the top 3 user experience issues or opportunities. Prioritize hypotheses that move the needle on whichever goal is furthest from its target. For each one:
1. Format it as a hypothesis: "We believe [change] will [outcome] measurable by [metric]"
2. Rank them by estimated impact on the goals (1 = highest impact)
3. Include a brief rationale referencing the relevant goal
4. Name the goal it targets

Return ONLY a JSON array with no other text. Each object should have:
- "rank": number (1-3)
- "hypothesis": the formatted hypothesis string
- "rationale": 1-2 sentence explanation
- "targetGoal": the goal key this addresses (e.g. "voteCompletionRate")

Example format:
[{"rank": 1, "hypothesis": "We believe simplifying the vote UI will increase vote completion rate measurable by vote_cast/pageview ratio", "rationale": "Completion rate is at 35%, well below the 60% target. Reducing friction in the voting flow is the highest-leverage change.", "targetGoal": "voteCompletionRate"}]`,
      },
    ],
  });

  const raw = response.content[0].text;
  const text = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(text);
}

// --- Notion writer ---

async function writeToNotion(hypotheses, summary, weekRange) {
  for (const h of hypotheses) {
    await notion.pages.create({
      parent: { database_id: NOTION_DATABASE_ID },
      properties: {
        Title: {
          title: [{ text: { content: h.hypothesis } }],
        },
        Rank: {
          number: h.rank,
        },
        Week: {
          rich_text: [{ text: { content: weekRange } }],
        },
      },
      children: [
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ text: { content: "Rationale" } }],
          },
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ text: { content: h.rationale } }],
          },
        },
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ text: { content: "Raw Analytics" } }],
          },
        },
        {
          object: "block",
          type: "code",
          code: {
            rich_text: [{ text: { content: summary } }],
            language: "plain text",
          },
        },
      ],
    });
  }
}

// --- Main ---

async function weeklyScan() {
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    throw new Error("Missing POSTHOG_API_KEY or POSTHOG_PROJECT_ID in .env.local");
  }
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    throw new Error("Missing NOTION_API_KEY or NOTION_DATABASE_ID in .env.local");
  }

  console.log("Fetching PostHog analytics (last 7 days)...");
  const { summary, weekRange } = await fetchAnalytics();
  console.log(summary);
  console.log();

  console.log("Sending to Claude for analysis...");
  const hypotheses = await analyzeWithClaude(summary);
  console.log(`Got ${hypotheses.length} hypotheses:`);
  hypotheses.forEach((h) => {
    console.log(`  #${h.rank}: ${h.hypothesis}`);
    console.log(`         ${h.rationale}`);
  });
  console.log();

  // Deadline awareness callout
  const ctx = readContext();
  const goals = ctx.goals || {};
  const currentMetrics = {
    voteCompletionRate: parseFloat(summary.match(/Vote completion rate:\s*([\d.]+)/)?.[1] || "0"),
    returnRate: parseFloat(summary.match(/Return rate:\s*([\d.]+)/)?.[1] || "0"),
    shareConversion: (() => {
      const votes = parseFloat(summary.match(/Votes cast:\s*([\d.]+)/)?.[1] || "0");
      const shares = parseFloat(summary.match(/Share clicks:\s*([\d.]+)/)?.[1] || "0");
      return votes > 0 ? ((shares / votes) * 100) : 0;
    })(),
  };
  const today = new Date();
  let hasUrgent = false;
  for (const [key, g] of Object.entries(goals)) {
    if (!g.deadline) continue;
    const daysLeft = Math.ceil((new Date(g.deadline) - today) / (1000 * 60 * 60 * 24));
    const current = currentMetrics[key];
    if (daysLeft <= 0) {
      console.log(`  ⚠️  OVERDUE: ${key} — deadline was ${g.deadline}, target: ${g.target}${g.unit}`);
      hasUrgent = true;
    } else if (daysLeft <= 14 && current != null) {
      const pct = ((current / g.target) * 100).toFixed(0);
      console.log(`  ⚠️  ${key} — ${daysLeft} days left, currently at ${current}${g.unit} (${pct}% of ${g.target}${g.unit} target)`);
      hasUrgent = true;
    }
  }
  if (hasUrgent) console.log();

  console.log("Writing to Notion...");
  await writeToNotion(hypotheses, summary, weekRange);
  console.log(`Created ${hypotheses.length} pages in Notion database.`);

  // Update shared context (ctx already loaded above for deadline check)

  // Parse metrics from summary text
  const parseMetric = (label) => {
    const match = summary.match(new RegExp(`${label}:\\s*([\\d.]+)`));
    return match ? parseFloat(match[1]) : 0;
  };

  ctx.weeklyMetrics.push({
    weekOf: weekRange.split(" → ")[0],
    sessions: parseMetric("Unique sessions"),
    votes: parseMetric("Votes cast"),
    completionRate: parseMetric("Vote completion rate"),
    returnRate: parseMetric("Return rate"),
    shares: parseMetric("Share clicks"),
  });

  for (const h of hypotheses) {
    ctx.hypotheses.push({
      id: `hyp-${Date.now()}-${h.rank}`,
      createdAt: new Date().toISOString().split("T")[0],
      source: "weekly-scan",
      statement: h.hypothesis,
      rationale: h.rationale,
      status: "proposed",
      experimentId: null,
      result: null,
      metrics: {},
    });
  }

  writeContext(ctx);
  console.log("Updated shared context.");

  process.exit(0);
}

weeklyScan().catch((err) => {
  console.error("Weekly scan failed:", err);
  process.exit(1);
});

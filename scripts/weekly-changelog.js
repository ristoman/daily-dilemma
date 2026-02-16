import { config } from "dotenv";
config({ path: ".env.local" });

import { execSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@notionhq/client";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_CHANGELOG_PAGE_ID = process.env.NOTION_CHANGELOG_PAGE_ID;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const notion = new Client({ auth: NOTION_API_KEY });

// --- Git helpers ---

function getCommitsLastWeek() {
  const log = execSync(
    'git log --since="7 days ago" --pretty=format:"%H|%ad|%s" --date=short',
    { encoding: "utf8" }
  ).trim();

  if (!log) return [];

  return log.split("\n").map((line) => {
    const [hash, date, ...messageParts] = line.split("|");
    return { hash, date, message: messageParts.join("|") };
  });
}

function getCommitStats(hash) {
  try {
    return execSync(`git show --stat --format="" ${hash}`, {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function buildRawLog(commits) {
  return commits
    .map((c) => {
      const stats = getCommitStats(c.hash);
      return `[${c.date}] ${c.message}\n${stats}`;
    })
    .join("\n\n");
}

// --- Claude summarizer ---

async function summarizeWithClaude(rawLog, weekRange) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are summarizing git commits for a small web app called "Daily Dilemma" (a daily voting/polling site).

Here are the commits and file changes from the past week (${weekRange}):

${rawLog}

Write a clean changelog suitable for a product log. Group changes into themes if there are multiple (e.g. "UI", "Analytics", "Bug fixes"). Use plain bullet points. Be concise and human-readable — no jargon, no git hashes. Focus on what changed from a product/user perspective.

Return ONLY a JSON object with no other text:
- "title": a short one-line summary of the week's work
- "groups": array of { "label": string, "items": string[] }

Example:
{"title": "UI polish and PostHog setup", "groups": [{"label": "UI", "items": ["Made feedback button more visible", "Added gradient to title"]}, {"label": "Analytics", "items": ["Wired up PostHog proxy to bypass ad blockers"]}]}`,
      },
    ],
  });

  const raw = response.content[0].text;
  const text = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(text);
}

// --- Notion writer ---

async function createNotionSubpage(summary, weekRange) {
  const blocks = [];

  for (const group of summary.groups) {
    if (summary.groups.length > 1) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: group.label } }],
        },
      });
    }

    for (const item of group.items) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: item } }],
        },
      });
    }
  }

  await notion.pages.create({
    parent: { page_id: NOTION_CHANGELOG_PAGE_ID },
    properties: {
      title: {
        title: [{ type: "text", text: { content: `${weekRange} — ${summary.title}` } }],
      },
    },
    children: blocks,
  });
}

// --- Main ---

async function weeklyChangelog() {
  if (!NOTION_API_KEY || !NOTION_CHANGELOG_PAGE_ID) {
    throw new Error(
      "Missing NOTION_API_KEY or NOTION_CHANGELOG_PAGE_ID in .env.local"
    );
  }

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekRange = `${weekAgo.toISOString().split("T")[0]} → ${today.toISOString().split("T")[0]}`;

  console.log(`Fetching git commits (${weekRange})...`);
  const commits = getCommitsLastWeek();

  if (commits.length === 0) {
    console.log("No commits in the last 7 days. Nothing to post.");
    process.exit(0);
  }

  console.log(`Found ${commits.length} commit(s).`);
  const rawLog = buildRawLog(commits);

  console.log("Summarizing with Claude...");
  const summary = await summarizeWithClaude(rawLog, weekRange);
  console.log(`Title: ${summary.title}`);
  summary.groups.forEach((g) => {
    console.log(`  [${g.label}]`);
    g.items.forEach((item) => console.log(`    • ${item}`));
  });

  console.log("\nCreating Notion subpage...");
  await createNotionSubpage(summary, weekRange);
  console.log("Done.");

  process.exit(0);
}

weeklyChangelog().catch((err) => {
  console.error("Weekly changelog failed:", err);
  process.exit(1);
});

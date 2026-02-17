import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const CONTEXT_PATH = resolve(process.cwd(), "data/context.json");

const EMPTY_CONTEXT = {
  lastUpdated: null,
  hypotheses: [],
  experiments: [],
  incidents: [],
  weeklyMetrics: [],
  dailyPulse: [],
  dilemmaQueue: {
    lastGenerated: null,
    scheduledThrough: null,
    totalCount: 0,
  },
};

export function readContext() {
  try {
    const raw = readFileSync(CONTEXT_PATH, "utf8");
    return { ...EMPTY_CONTEXT, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_CONTEXT };
  }
}

export function writeContext(ctx) {
  ctx.lastUpdated = new Date().toISOString();
  writeFileSync(CONTEXT_PATH, JSON.stringify(ctx, null, 2) + "\n");
}

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTEXT_PATH = resolve(__dirname, "../data/context.json");

const EMPTY_CONTEXT = {
  lastUpdated: null,
  hypotheses: [],
  experiments: [],
  incidents: [],
  weeklyMetrics: [],
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

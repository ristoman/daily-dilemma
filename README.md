# Daily Dilemma

A simple polling app — but that's not the point. The real experiment is what happens when you let AI agents run the entire product lifecycle.

## The Experiment: AI-Driven SDLC

Daily Dilemma is a testbed for exploring how much of the software development lifecycle can be automated with AI. The app itself is deliberately simple (vote on fun dilemmas) so the focus stays on the operational layer built around it.

The question we're trying to answer: **can AI agents handle the ongoing work of running a product — not just building it?**

### What's automated

Every stage after the initial build is handled by AI-powered scripts and workflows:

**Content Generation** — A Claude-powered script generates new dilemma questions weekly, auto-chaining dates from the latest entry and avoiding duplicates against existing content. Runs on a cron via GitHub Actions every Sunday.

**Analytics & Insights** — A weekly scan pulls the last 7 days of analytics from PostHog (pageviews, vote completion rate, return rate, time-to-vote), sends the raw data to Claude, and gets back ranked UX hypotheses formatted as "We believe [change] will [outcome] measurable by [metric]". Results are written to Notion automatically.

**Experiment Monitoring** — An experiment monitor checks all running PostHog A/B tests, evaluates whether they've reached statistical significance, and writes a recommendation to Notion: ramp to 100%, roll back, or keep running with an estimated time to significance based on current traffic.

**Daily Health Check & Pipeline** — A daily scan pulls the last 24 hours of metrics from PostHog, compares against recent baselines, and flags anomalies. It also coordinates the experiment pipeline: checking if an experiment just concluded, updating linked hypotheses, and recommending the next hypothesis to test based on priority and dependency satisfaction.

**Incident Response** — A watchdog runs every hour via GitHub Actions, checks Sentry for error spikes, and if the count exceeds a threshold it automatically disables all feature flags in PostHog and sends an alert email. The idea: roll back experiments before they cause more damage, without waiting for a human.

### The loop

Together these form a closed loop:

1. **Generate** content (Claude API)
2. **Measure** user behavior (PostHog)
3. **Analyze** and form hypotheses (Claude API + Notion)
4. **Experiment** with changes (PostHog feature flags)
5. **Monitor** for significance and errors (PostHog + Sentry)
6. **Act** automatically (disable flags, send alerts, write reports)

The only step that requires a human is deciding which hypothesis to turn into an experiment — the daily pipeline recommends the next one, but a human sets up the feature flag. Every other step is transparent and auditable via Notion pages and console logs.

### What we're learning

- How reliable are AI-generated UX hypotheses compared to human product intuition?
- Can automated experiment monitoring replace manual significance checks?
- What's the right error threshold for automatic rollbacks — too low and you get false positives, too high and users suffer?
- Does weekly AI-generated content maintain quality over time, or does it drift?

---

## Tech Stack

- **Framework:** Next.js 16 (App Router, React 19)
- **Database:** Vercel Postgres (Neon) with Drizzle ORM
- **Styling:** Tailwind CSS v4, shadcn/ui
- **Analytics:** PostHog (pageviews, custom events, A/B experiments)
- **Error Tracking:** Sentry
- **AI:** Anthropic Claude API (content generation, analytics analysis)
- **Notifications:** Notion API (reports), Resend (alert emails)
- **Deployment:** Vercel + GitHub Actions

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Copy the environment variables and fill them in:

```bash
cp .env.local.example .env.local
```

You'll need:
- `POSTGRES_URL` — Vercel Postgres / Neon connection string
- `ANTHROPIC_API_KEY` — for dilemma generation and analysis scripts

3. Push the database schema and seed initial data:

```bash
npm run db:push
npm run db:seed
```

4. Start the dev server:

```bash
npm run dev
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run db:push` | Push Drizzle schema to database |
| `npm run db:seed` | Seed initial dilemmas |
| `npm run generate` | Generate 7 new dilemmas via Claude API |
| `npm run daily-scan` | Daily health check + experiment pipeline coordinator |
| `npm run weekly-scan` | Pull PostHog analytics, analyze with Claude, write to Notion |
| `npm run experiment-monitor` | Check PostHog experiments for significance, report to Notion |
| `npm run watchdog` | Check Sentry errors, disable feature flags if threshold exceeded |
| `npm run weekly-changelog` | Summarize git commits into a Notion changelog |

## GitHub Actions

| Workflow | Schedule | What it does |
|---|---|---|
| Generate Dilemmas | Every Sunday at midnight UTC | Generates 7 new dilemmas and inserts them into the database |
| Daily Scan | Every day at 2:00 AM UTC | Health check against 24h metrics, experiment pipeline coordination, daily pulse log |
| Weekly Scan | Every Monday at 1:00 AM UTC | Pulls PostHog analytics, Claude generates hypotheses, writes to Notion |
| Experiment Monitor | Every day at 9:00 AM UTC | Checks running A/B tests for statistical significance, reports to Notion |
| Error Watchdog | Every hour | Checks Sentry error rate, auto-disables feature flags if errors spike, sends alert email |
| Weekly Changelog | Every Monday at 4:00 AM UTC | Claude summarizes git commits into a Notion changelog |

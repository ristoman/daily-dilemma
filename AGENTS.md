# AGENTS.md

## Project overview

Daily Dilemma is a Next.js app that presents a daily "would you rather" question. It's an AI-first product experiment — content generation, analytics, hypothesis formation, and experiment monitoring all have AI layers. The final decision always rests with a human.

## Build and run

```bash
npm run dev          # Local dev server (Next.js)
npm run build        # Production build — run before committing to verify
npm run lint         # ESLint
npm run db:push      # Push Drizzle schema to Vercel Postgres
npm run db:seed      # Seed database with initial dilemmas
```

## Automated scripts

These run on GitHub Actions schedules and can be run locally with `npx tsx`:

| Script | Schedule | Purpose |
|---|---|---|
| `generate-dilemmas.js` | Weekly | Claude generates 7 dilemmas, inserts into DB |
| `weekly-scan.js` | Weekly | Pulls PostHog analytics, Claude produces hypotheses |
| `experiment-monitor.js` | Daily | Checks running A/B tests for statistical significance |
| `watchdog.js` | Hourly | Monitors Sentry error rates, kills experiments if needed |
| `weekly-changelog.js` | Weekly | Claude summarizes git commits into a Notion changelog |

## Project structure

```
app/                  → Next.js App Router pages and API routes
  api/dilemma/        → GET today's dilemma
  api/vote/           → POST a vote (sets session cookie)
  api/feedback/       → POST user feedback → Notion
  api/reset/          → POST reset session (dev only)
  about/              → Public about page (server component, live DB stats)
  privacy/            → Privacy policy
components/           → React components (cookie banner, PostHog provider, shadcn/ui)
lib/
  db/index.ts         → Drizzle ORM instance (Vercel Postgres)
  db/schema.ts        → Database schema (dilemmas, votes, feedback)
  context.js          → readContext() / writeContext() for experiment state
data/
  context.json        → Living experiment state: goals, hypotheses, experiments
scripts/              → Automated AI scripts (see table above)
```

## Database

- **Vercel Postgres** via `@vercel/postgres` + Drizzle ORM
- Schema in `lib/db/schema.ts` — three tables: `dilemmas`, `votes`, `feedback`
- Column names use `snake_case` in the DB, `camelCase` in TypeScript
- Push schema changes with `npm run db:push` (no migration files)

## Styling

- **Tailwind CSS v4** with `tw-animate-css`
- **shadcn/ui** components in `components/ui/`
- Use existing theme tokens: `text-foreground`, `text-muted-foreground`, `bg-muted`, `border-border`, etc.
- Responsive: mobile-first, use `sm:` breakpoint for desktop overrides
- No custom CSS unless absolutely necessary — prefer Tailwind utilities

## Analytics (PostHog)

- EU-hosted, proxied through `/ingest/` rewrites in `next.config.ts`
- Client-side SDK initialized in `components/posthog-provider.tsx`
- Event names use `snake_case`:
  - `question_loaded` — dilemma displayed
  - `vote_cast` — user voted (includes `dilemma_id`, `choice`)
  - `results_viewed` — results shown after voting
  - `share_clicked` — share button used (includes `method`)
  - `feedback_submitted` — free-text feedback sent

## Error monitoring (Sentry)

- `@sentry/nextjs` with source map uploads
- Tunneled through `/monitoring` route to avoid ad blockers
- `global-error.tsx` catches React errors

## Context system (`data/context.json`)

This is the living state of the product experiment. Scripts read and write it.

```js
import { readContext, writeContext } from "@/lib/context.js";
```

- **goals** — SMART goals with targets, units, deadlines, and metric definitions
- **hypotheses** — proposed/running/concluded experiment ideas with dependencies
- **experiments** — A/B test records linked to hypotheses
- **incidents** — watchdog-triggered incidents
- **weeklyMetrics** — historical snapshots from weekly-scan

When modifying context.json programmatically, always use `writeContext()` — it auto-sets `lastUpdated`. The about page reads this file at render time to display live experiment status.

## Environment variables

Required in `.env.local` (never commit this file):

```
POSTGRES_URL                 # Vercel Postgres connection string
NEXT_PUBLIC_POSTHOG_KEY      # PostHog project API key
NEXT_PUBLIC_POSTHOG_HOST     # PostHog host (proxied through /ingest)
ANTHROPIC_API_KEY            # Claude API key (scripts only)
POSTHOG_API_KEY              # PostHog private API key (scripts only)
POSTHOG_PROJECT_ID           # PostHog project ID (scripts only)
NOTION_API_KEY               # Notion integration token
NOTION_DATABASE_ID           # Notion database for weekly reports
NOTION_FEEDBACK_PAGE_ID      # Notion page for user feedback
NOTION_CHANGELOG_PAGE_ID     # Notion page for weekly changelogs
SENTRY_AUTH_TOKEN            # Sentry auth (watchdog + build)
SENTRY_ORG                   # Sentry org slug
SENTRY_PROJECT               # Sentry project slug
RESEND_API_KEY               # Resend API key (watchdog alerts)
ALERT_EMAIL_TO               # Alert recipient email
```

## Conventions

- Server components by default; use `"use client"` only when needed (interactivity, hooks)
- API routes return JSON with appropriate status codes
- Session ID stored in HTTP-only cookie (`dd_session`), set on first vote
- No personal data collected — sessions are anonymous
- Commit messages: concise, imperative mood, focused on "why"

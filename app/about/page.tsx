import type { Metadata } from "next";
import { db } from "@/lib/db";
import { dilemmas, votes } from "@/lib/db/schema";
import { count, sql, lte } from "drizzle-orm";
import { readContext } from "@/lib/context.js";

export const metadata: Metadata = {
  title: "About — Daily Dilemma",
};

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const today = new Date().toISOString().split("T")[0];

  const [{ totalDilemmas }] = await db
    .select({ totalDilemmas: count() })
    .from(dilemmas)
    .where(lte(dilemmas.publishedDate, today));

  const [{ totalVotes }] = await db.select({ totalVotes: count() }).from(votes);

  const [{ uniqueVoters }] = await db
    .select({
      uniqueVoters: sql<number>`count(distinct session_id)::int`,
    })
    .from(votes);

  const ctx = readContext();
  const goals = ctx.goals || {};
  const hypotheses = ctx.hypotheses || [];
  const experiments = ctx.experiments || [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <a
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to Daily Dilemma
      </a>

      <h1 className="mb-2 text-3xl font-extrabold">About Daily Dilemma</h1>
      <p className="mb-10 text-sm text-muted-foreground">
        Daily Dilemma is an AI-first product experiment. Every part of the
        software delivery lifecycle, from content to analysis to optimization,
        has an AI layer to empower decision-making. The final decision always
        rests with a human, but AI does most of the heavy lifting.
      </p>

      <div className="flex flex-col gap-10 text-sm leading-relaxed text-muted-foreground">
        {/* How it works */}
        <section>
          <h2 className="mb-3 text-lg font-bold text-foreground">
            How it works
          </h2>
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-foreground">Generate</h3>
              <p>
                Every week, Claude generates 7 new dilemma questions — fun,
                polarizing, non-controversial. They&apos;re scheduled one per
                day and stored in a database queue.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Measure</h3>
              <p>
                Anonymous analytics track how people interact: pageviews, votes,
                time to vote, shares, and return visits. No personal data is
                collected — just anonymous session IDs.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Analyze</h3>
              <p>
                A weekly scan feeds the analytics into Claude, which identifies
                UX issues and opportunities. It outputs ranked hypotheses
                formatted as &ldquo;We believe [change] will [outcome]
                measurable by [metric].&rdquo;{" "}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">User Feedback</h3>
              <p>
                Numbers only tell part of the story. Real user feedback
                submitted through the app is reviewed alongside the data, so
                human voices shape what gets prioritized, not just metrics.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Experiment</h3>
              <p>
                Hypotheses get turned into A/B tests via feature flags. An
                experiment monitor checks statistical significance and
                recommends whether to ship, roll back, or keep running.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Safeguard</h3>
              <p>
                A watchdog runs every hour. If error rates spike, it
                automatically disables all feature flags and sends an alert.
                Experiments that cause problems get killed before they cause
                real damage.
              </p>
            </div>
          </div>
        </section>

        {/* Live stats */}
        <section>
          <h2 className="mb-3 text-lg font-bold text-foreground">
            The experiment so far
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <Stat value={totalDilemmas} label="dilemmas published" />
            <Stat value={totalVotes.toLocaleString()} label="votes cast" />
            <Stat value={uniqueVoters.toLocaleString()} label="unique voters" />
          </div>
        </section>

        {/* Goals */}
        {Object.keys(goals).length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">
              Current goals
            </h2>
            <div className="flex flex-col gap-2">
              {Object.entries(goals).map(([key, g]: [string, any]) => (
                <div
                  key={key}
                  className="flex items-baseline justify-between rounded-lg border border-border px-3 py-2"
                >
                  <span className="font-medium text-foreground">
                    {formatGoalName(key)}
                  </span>
                  <span>
                    {g.target}
                    {g.unit.startsWith("%") ? "" : " "}
                    {g.unit}
                    {g.deadline && (
                      <span className="ml-2 text-xs">by {g.deadline}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Hypotheses */}
        {hypotheses.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">
              Recent hypotheses
            </h2>
            <div className="flex flex-col gap-3">
              {hypotheses
                .slice(-5)
                .reverse()
                .map((h: any) => (
                  <div
                    key={h.id}
                    className="rounded-lg border border-border px-3 py-2"
                  >
                    <p className="text-foreground">{h.statement}</p>
                    <p className="mt-1 text-xs">
                      {h.status} · {h.createdAt}
                      {h.source && <span> · via {h.source}</span>}
                    </p>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Experiments */}
        {experiments.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">
              Experiments
            </h2>
            <div className="flex flex-col gap-3">
              {experiments
                .slice(-5)
                .reverse()
                .map((e: any) => (
                  <div
                    key={e.id}
                    className="rounded-lg border border-border px-3 py-2"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-medium text-foreground">
                        {e.name || e.flagKey}
                      </span>
                      <ExperimentBadge status={e.status} />
                    </div>
                    {e.startedAt && (
                      <p className="mt-1 text-xs">
                        Started {e.startedAt}
                        {e.endedAt && <span> · Ended {e.endedAt}</span>}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* No activity yet */}
        {hypotheses.length === 0 && experiments.length === 0 && (
          <section className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
            <p className="text-muted-foreground">
              No hypotheses or experiments yet — the AI loop is just getting
              started. Check back soon.
            </p>
          </section>
        )}

        {/* Stack */}
        <section>
          <h2 className="mb-3 text-lg font-bold text-foreground">Built with</h2>
          <div className="flex flex-wrap gap-2">
            <ToolLink
              href="https://claude.ai"
              name="Claude"
              desc="content generation + analysis"
            />
            <ToolLink
              href="https://nextjs.org"
              name="Next.js"
              desc="framework"
            />
            <ToolLink
              href="https://vercel.com"
              name="Vercel"
              desc="hosting + database"
            />
            <ToolLink
              href="https://posthog.com"
              name="PostHog"
              desc="analytics + experiments"
            />
            <ToolLink
              href="https://www.notion.com"
              name="Notion"
              desc="reports + feedback"
            />
            <ToolLink
              href="https://sentry.io"
              name="Sentry"
              desc="error monitoring"
            />
            <ToolLink
              href="https://github.com/features/actions"
              name="GitHub Actions"
              desc="automation"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border px-3 py-4">
      <span className="text-2xl font-bold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function ExperimentBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: "bg-blue-500/10 text-blue-500",
    concluded: "bg-green-500/10 text-green-500",
    "rolled-back": "bg-red-500/10 text-red-500",
    "killed-by-watchdog": "bg-red-500/10 text-red-500",
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || "bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}

function ToolLink({
  href,
  name,
  desc,
}: {
  href: string;
  name: string;
  desc: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-1.5 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted"
    >
      <span className="font-medium text-foreground">{name}</span>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </a>
  );
}

function formatGoalName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

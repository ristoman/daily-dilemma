"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePostHog, useFeatureFlagEnabled } from "posthog-js/react";
import { Button } from "@/components/ui/button";

type Dilemma = {
  id: number;
  question: string;
  optionA: string;
  optionB: string;
  publishedDate: string;
  votes: { a: number; b: number };
  userVote: "a" | "b" | null;
  likes: number;
  userLiked: boolean;
};

export default function Home() {
  const posthog = usePostHog();
  const [dilemma, setDilemma] = useState<Dilemma | null>(null);
  const [allAnswered, setAllAnswered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const dilemmaShownAt = useRef<number>(0);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleDarkMode() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  const fetchDilemma = useCallback(() => {
    setLoading(true);
    fetch("/api/dilemma/today")
      .then((res) => res.json())
      .then((data) => {
        if (data.answeredCount != null) setAnsweredCount(data.answeredCount);
        if (data.dilemma) {
          setDilemma(data.dilemma);
          setAllAnswered(false);
          dilemmaShownAt.current = Date.now();
          posthog.capture("question_loaded", { dilemma_id: data.dilemma.id });
        } else {
          setDilemma(null);
          setAllAnswered(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDilemma();
  }, [fetchDilemma]);

  async function handleVote(choice: "a" | "b") {
    if (!dilemma || dilemma.userVote || voting) return;
    setVoting(true);

    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dilemma_id: dilemma.id, choice }),
    });

    if (res.ok) {
      const data = await res.json();
      const timeToVote = (Date.now() - dilemmaShownAt.current) / 1000;
      setDilemma({ ...dilemma, userVote: choice, votes: data.votes });
      setAnsweredCount((c) => c + 1);
      posthog.capture("vote_cast", {
        dilemma_id: dilemma.id,
        choice,
        time_to_vote_seconds: Math.round(timeToVote * 10) / 10,
      });
      posthog.capture("results_viewed", { dilemma_id: dilemma.id });
    }
    setVoting(false);
  }

  return (
    <div className="flex min-h-svh flex-col bg-background transition-colors duration-300">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <div className="w-24">
          {answeredCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium whitespace-nowrap">
              <span className="text-base">🔥</span>
              {answeredCount} streak
            </span>
          )}
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <h1 className="text-sm font-extrabold uppercase text-white">
            Daily Dilemma
          </h1>
          <p className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
            Every Day, a Dilemma
          </p>
        </div>
        <div className="flex w-24 justify-end">
          <button
            onClick={toggleDarkMode}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Toggle dark mode"
          >
            {isDark ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="m4.93 4.93 1.41 1.41" />
                <path d="m17.66 17.66 1.41 1.41" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="m6.34 17.66-1.41 1.41" />
                <path d="m19.07 4.93-1.41 1.41" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-4 pb-16">
        {loading ? (
          <LoadingSkeleton />
        ) : allAnswered || !dilemma ? (
          <AllCaughtUp answeredCount={answeredCount} />
        ) : (
          <>
            {/* Question */}
            <h2
              key={dilemma.id}
              className="animate-fade-in-up max-w-2xl text-center text-3xl font-extrabold leading-tight sm:text-5xl lg:text-6xl"
            >
              {dilemma.question}
            </h2>

            {!dilemma.userVote ? (
              /* Vote Buttons */
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
                <button
                  className="animate-fade-in-up-delay group min-w-48 cursor-pointer whitespace-nowrap rounded-2xl bg-option-a px-6 py-6 text-xl font-bold text-white shadow-lg transition-all hover:scale-[1.03] hover:bg-option-a-hover hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:py-7 sm:text-2xl"
                  disabled={voting}
                  onClick={() => handleVote("a")}
                >
                  {dilemma.optionA}
                </button>

                <span className="animate-fade-in-up-delay text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  vs
                </span>

                <button
                  className="animate-fade-in-up-delay-2 group min-w-48 cursor-pointer whitespace-nowrap rounded-2xl bg-option-b px-6 py-6 text-xl font-bold text-white shadow-lg transition-all hover:scale-[1.03] hover:bg-option-b-hover hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:py-7 sm:text-2xl"
                  disabled={voting}
                  onClick={() => handleVote("b")}
                >
                  {dilemma.optionB}
                </button>
              </div>
            ) : (
              /* Results */
              <Results
                dilemma={dilemma}
                onNext={fetchDilemma}
                copied={copied}
                setCopied={setCopied}
                posthog={posthog}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="flex flex-col items-center gap-2 pb-4 pt-2">
        <FeedbackForm posthog={posthog} />
        <div className="flex items-center gap-3">
          <a
            href="/about"
            className="text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            About
          </a>
          <span className="text-xs text-muted-foreground/30">·</span>
          <a
            href="/privacy"
            className="text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            Privacy
          </a>
        </div>
      </footer>
    </div>
  );
}

function FeedbackForm({ posthog }: { posthog: ReturnType<typeof usePostHog> }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || submitting) return;
    setSubmitting(true);

    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.trim() }),
    });

    if (res.ok) {
      posthog.capture("feedback_submitted");
      setSubmitted(true);
      setMessage("");
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
      }, 2000);
    }
    setSubmitting(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-1.5 text-m font-semibold text-foreground transition-colors hover:bg-accent"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Send Feedback
      </button>
    );
  }

  return (
    <div className="animate-fade-in-up mx-auto w-full max-w-sm px-4">
      {submitted ? (
        <p className="text-sm text-muted-foreground">
          Thanks for the feedback!
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What could be better?"
            maxLength={2000}
            rows={3}
            className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <Button
              type="submit"
              size="sm"
              className="rounded-full"
              disabled={!message.trim() || submitting}
            >
              {submitting ? "Sending..." : "Send"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Results({
  dilemma,
  onNext,
  copied,
  setCopied,
  posthog,
}: {
  dilemma: Dilemma;
  onNext: () => void;
  copied: boolean;
  setCopied: (v: boolean) => void;
  posthog: ReturnType<typeof usePostHog>;
}) {
  const total = dilemma.votes.a + dilemma.votes.b;
  const aPercent = total > 0 ? Math.round((dilemma.votes.a / total) * 100) : 50;
  const bPercent = total > 0 ? 100 - aPercent : 50;

  const flagEnabled = useFeatureFlagEnabled("like-button");
  const isDev = typeof window !== "undefined" && window.location.hostname === "localhost";
  const showLikeButton = isDev || flagEnabled === true;

  const [liked, setLiked] = useState(dilemma.userLiked);
  const [likeCount, setLikeCount] = useState(dilemma.likes);
  const [liking, setLiking] = useState(false);

  async function handleLike() {
    if (liked || liking) return;
    setLiking(true);
    const res = await fetch("/api/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dilemma_id: dilemma.id }),
    });
    if (res.ok) {
      const data = await res.json();
      setLiked(true);
      setLikeCount(data.likes);
      posthog.capture("dilemma_liked", { dilemma_id: dilemma.id });
    }
    setLiking(false);
  }

  const choice = dilemma.userVote === "a" ? dilemma.optionA : dilemma.optionB;
  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/?d=${dilemma.id}`;
  const shareText = `I said "${choice}" on today's dilemma: ${dilemma.question} What do you think?`;

  function trackShare(method: string) {
    posthog.capture("share_clicked", { dilemma_id: dilemma.id, method });
  }

  return (
    <div className="animate-fade-in-up flex w-full max-w-lg flex-col gap-5">
      <ResultBar
        dilemma={dilemma}
        aPercent={aPercent}
        bPercent={bPercent}
      />

      <p className="text-center text-sm text-muted-foreground">
        {total.toLocaleString()} votes
      </p>

      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-full" onClick={onNext}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Keep going
          </Button>

          {showLikeButton && (
            <button
              onClick={handleLike}
              disabled={liked}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                liked
                  ? "border-red-200 bg-red-50 text-red-500 dark:border-red-900 dark:bg-red-950"
                  : "border-border text-muted-foreground hover:bg-muted"
              } disabled:cursor-default`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill={liked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={liked ? "text-red-500" : ""}
              >
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
              {liked ? `Loved! ${likeCount}` : `Loved this! ${likeCount > 0 ? likeCount : ""}`}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground"
            onClick={() => {
              navigator.clipboard.writeText(shareUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
              trackShare("copy_link");
            }}
          >
            {copied ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                Copy link
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground"
            onClick={() => {
              window.open(
                `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
                "_blank",
              );
              trackShare("twitter");
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share on X
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground"
            onClick={() => {
              window.open(
                `https://bsky.app/intent/compose?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
                "_blank",
              );
              trackShare("bluesky");
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 600 530"
              fill="currentColor"
            >
              <path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1938 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z" />
            </svg>
            Bluesky
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResultBar({
  dilemma,
  aPercent,
  bPercent,
}: {
  dilemma: Dilemma;
  aPercent: number;
  bPercent: number;
}) {
  const aWins = aPercent >= bPercent;
  const checkIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Labels row */}
      <div className="flex items-end justify-between text-sm font-medium">
        <span className="flex items-center gap-1.5">
          {dilemma.userVote === "a" && (
            <span className="text-option-a">{checkIcon}</span>
          )}
          <span className={aWins ? "font-bold" : "text-muted-foreground"}>
            {dilemma.optionA}
          </span>
          <span className={aWins ? "font-bold text-lg" : "text-muted-foreground"}>
            {aPercent}%
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className={!aWins ? "font-bold text-lg" : "text-muted-foreground"}>
            {bPercent}%
          </span>
          <span className={!aWins ? "font-bold" : "text-muted-foreground"}>
            {dilemma.optionB}
          </span>
          {dilemma.userVote === "b" && (
            <span className="text-option-b">{checkIcon}</span>
          )}
        </span>
      </div>

      {/* Single combined bar */}
      <div className="flex h-5 w-full overflow-hidden rounded-full">
        <div
          className="h-full bg-option-a"
          style={{ width: `${aPercent}%` }}
        />
        <div
          className="h-full bg-option-b"
          style={{ width: `${bPercent}%` }}
        />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-10">
      <div className="h-10 w-3/4 animate-pulse rounded-xl bg-muted" />
      <div className="h-6 w-1/2 animate-pulse rounded-lg bg-muted" />
      <div className="flex w-full max-w-lg flex-col gap-4 sm:flex-row">
        <div className="h-16 w-full animate-pulse rounded-2xl bg-muted sm:h-20" />
        <div className="h-16 w-full animate-pulse rounded-2xl bg-muted sm:h-20" />
      </div>
    </div>
  );
}

function AllCaughtUp({ answeredCount }: { answeredCount: number }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function update() {
      const now = new Date();
      // Compute the current time in Europe/Berlin, then find next midnight in that zone
      const berlinNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
      const utcOffsetMs = berlinNow.getTime() - now.getTime();
      const cetNow = new Date(now.getTime() + utcOffsetMs);
      const midnightCet = new Date(cetNow);
      midnightCet.setHours(24, 0, 0, 0);
      const diff = midnightCet.getTime() - cetNow.getTime();

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
      );
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="animate-fade-in-up flex max-w-full flex-col items-center gap-4 px-4 text-center">
      <div className="text-5xl">🏆</div>
      <h2 className="text-3xl font-extrabold sm:text-4xl">
        You&apos;ve conquered them all
      </h2>
      <p className="text-muted-foreground">
        {answeredCount} dilemmas answered. New ones drop at midnight CET.
      </p>

      {/* Countdown */}
      <div className="flex flex-col items-center gap-2 pt-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Next dilemma in
        </p>
        <div className="font-mono text-5xl font-bold tracking-wider sm:text-6xl">
          {timeLeft}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePostHog, useFeatureFlagVariantKey } from "posthog-js/react";
import { Button } from "@/components/ui/button";

type Dilemma = {
  id: number;
  question: string;
  optionA: string;
  optionB: string;
  votes: { a: number; b: number };
  userVote: "a" | "b" | null;
};

export default function Home() {
  const posthog = usePostHog();
  const shareVariant = useFeatureFlagVariantKey("share-prompt-impact");
  const showSharePrompt = shareVariant === "test";
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
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium">
              <span className="text-base">🔥</span>
              {answeredCount} streak
            </span>
          )}
        </div>
        <h1 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Daily Dilemma
        </h1>
        <div className="flex w-24 justify-end">
          <button
            onClick={toggleDarkMode}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Toggle dark mode"
          >
            {isDark ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-4 pb-12">
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
              <div className="flex w-full max-w-lg flex-col items-center gap-4 sm:flex-row sm:gap-5">
                <button
                  className="animate-fade-in-up-delay group w-full cursor-pointer rounded-2xl bg-option-a px-6 py-6 text-xl font-bold text-white shadow-lg transition-all hover:scale-[1.03] hover:bg-option-a-hover hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:py-7 sm:text-2xl"
                  disabled={voting}
                  onClick={() => handleVote("a")}
                >
                  {dilemma.optionA}
                </button>

                <span className="animate-fade-in-up-delay text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  vs
                </span>

                <button
                  className="animate-fade-in-up-delay-2 group w-full cursor-pointer rounded-2xl bg-option-b px-6 py-6 text-xl font-bold text-white shadow-lg transition-all hover:scale-[1.03] hover:bg-option-b-hover hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:py-7 sm:text-2xl"
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
                showSharePrompt={showSharePrompt}
                copied={copied}
                setCopied={setCopied}
                posthog={posthog}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Results({
  dilemma,
  onNext,
  showSharePrompt,
  copied,
  setCopied,
  posthog,
}: {
  dilemma: Dilemma;
  onNext: () => void;
  showSharePrompt: boolean;
  copied: boolean;
  setCopied: (v: boolean) => void;
  posthog: ReturnType<typeof usePostHog>;
}) {
  const total = dilemma.votes.a + dilemma.votes.b;
  const aPercent = total > 0 ? Math.round((dilemma.votes.a / total) * 100) : 50;
  const bPercent = total > 0 ? 100 - aPercent : 50;

  return (
    <div className="animate-fade-in-up flex w-full max-w-lg flex-col gap-5">
      <ResultBar
        label={dilemma.optionA}
        percent={aPercent}
        isWinner={aPercent >= bPercent}
        isSelected={dilemma.userVote === "a"}
        color="a"
      />
      <ResultBar
        label={dilemma.optionB}
        percent={bPercent}
        isWinner={bPercent > aPercent}
        isSelected={dilemma.userVote === "b"}
        color="b"
      />

      <p className="text-center text-sm text-muted-foreground">
        {total.toLocaleString()} votes
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        <Button variant="outline" className="rounded-full" onClick={onNext}>
          Next dilemma →
        </Button>
        {showSharePrompt && (
          <>
            <Button
              variant="ghost"
              className="rounded-full"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
                posthog.capture("share_clicked", {
                  dilemma_id: dilemma.id,
                  method: "copy_link",
                });
              }}
            >
              {copied ? "Copied!" : "Copy link"}
            </Button>
            <Button
              variant="ghost"
              className="rounded-full"
              onClick={() => {
                const text = `${dilemma.question} — vote now!`;
                const url = window.location.href;
                window.open(
                  `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
                  "_blank"
                );
                posthog.capture("share_clicked", {
                  dilemma_id: dilemma.id,
                  method: "twitter",
                });
              }}
            >
              Share on X
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ResultBar({
  label,
  percent,
  isWinner,
  isSelected,
  color,
}: {
  label: string;
  percent: number;
  isWinner: boolean;
  isSelected: boolean;
  color: "a" | "b";
}) {
  const bgClass = color === "a" ? "bg-option-a" : "bg-option-b";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-1.5">
          {isSelected && (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={color === "a" ? "text-option-a" : "text-option-b"}><path d="M20 6 9 17l-5-5"/></svg>
          )}
          <span className={isWinner ? "font-bold" : "text-muted-foreground"}>
            {label}
          </span>
        </span>
        <span className={isWinner ? "font-bold text-lg" : "text-muted-foreground"}>
          {percent}%
        </span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`animate-bar-fill h-full rounded-full ${bgClass} ${isWinner ? "animate-pulse-glow" : ""}`}
          style={{ width: `${percent}%` }}
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
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="animate-fade-in-up flex flex-col items-center gap-6 text-center">
      <div className="text-5xl">🏆</div>
      <h2 className="text-3xl font-extrabold sm:text-4xl">
        You&apos;ve conquered them all
      </h2>
      <p className="max-w-sm text-muted-foreground">
        {answeredCount} dilemmas answered. New ones drop at midnight.
      </p>

      {/* Countdown */}
      <div className="flex flex-col items-center gap-2 pt-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Next batch in
        </p>
        <div className="font-mono text-5xl font-bold tracking-wider sm:text-6xl">
          {timeLeft}
        </div>
      </div>
    </div>
  );
}

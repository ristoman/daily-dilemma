"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type Dilemma = {
  id: number;
  question: string;
  optionA: string;
  optionB: string;
  votes: { a: number; b: number };
  userVote: "a" | "b" | null;
};

export default function Home() {
  const [dilemma, setDilemma] = useState<Dilemma | null>(null);
  const [allAnswered, setAllAnswered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);

  const fetchDilemma = useCallback(() => {
    setLoading(true);
    fetch("/api/dilemma/today")
      .then((res) => res.json())
      .then((data) => {
        if (data.dilemma) {
          setDilemma(data.dilemma);
          setAllAnswered(false);
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
      setDilemma({ ...dilemma, userVote: choice, votes: data.votes });
    }
    setVoting(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-svh flex-col bg-background">
        <header className="border-b px-4 py-4">
          <h1 className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Daily Dilemma
          </h1>
        </header>
        <main className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </main>
      </div>
    );
  }

  if (allAnswered || !dilemma) {
    return (
      <div className="flex min-h-svh flex-col bg-background">
        <header className="border-b px-4 py-4">
          <h1 className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Daily Dilemma
          </h1>
        </header>
        <main className="flex flex-1 items-center justify-center px-4">
          <p className="text-center text-lg text-muted-foreground">
            Come back tomorrow for a new dilemma
          </p>
        </main>
      </div>
    );
  }

  const total = dilemma.votes.a + dilemma.votes.b;
  const aPercent = total > 0 ? Math.round((dilemma.votes.a / total) * 100) : 50;
  const bPercent = total > 0 ? 100 - aPercent : 50;

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b px-4 py-4">
        <h1 className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Daily Dilemma
        </h1>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
        <h2 className="max-w-2xl text-center text-4xl font-bold sm:text-5xl lg:text-6xl">
          {dilemma.question}
        </h2>

        {!dilemma.userVote ? (
          <div className="grid w-full max-w-md grid-cols-2 gap-3">
            <Button
              size="lg"
              className="h-14 text-lg"
              disabled={voting}
              onClick={() => handleVote("a")}
            >
              {dilemma.optionA}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 text-lg"
              disabled={voting}
              onClick={() => handleVote("b")}
            >
              {dilemma.optionB}
            </Button>
          </div>
        ) : (
          <div className="flex w-full max-w-md flex-col gap-4">
            <ResultBar
              label={dilemma.optionA}
              percent={aPercent}
              isWinner={aPercent >= bPercent}
              isSelected={dilemma.userVote === "a"}
            />
            <ResultBar
              label={dilemma.optionB}
              percent={bPercent}
              isWinner={bPercent > aPercent}
              isSelected={dilemma.userVote === "b"}
            />
            <p className="text-center text-sm text-muted-foreground">
              {total.toLocaleString()} votes
            </p>
            <Button
              variant="outline"
              className="mx-auto mt-2"
              onClick={fetchDilemma}
            >
              Next dilemma
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function ResultBar({
  label,
  percent,
  isWinner,
  isSelected,
}: {
  label: string;
  percent: number;
  isWinner: boolean;
  isSelected: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className={isWinner ? "font-semibold" : "text-muted-foreground"}>
          {label}
          {isSelected && " (your vote)"}
        </span>
        <span className={isWinner ? "font-semibold" : "text-muted-foreground"}>
          {percent}%
        </span>
      </div>
      <Progress value={percent} className="h-3" />
    </div>
  );
}

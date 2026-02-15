"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function Home() {
  const [vote, setVote] = useState<"yes" | "no" | null>(null);
  const [votes, setVotes] = useState({ yes: 124, no: 187 });

  function handleVote(choice: "yes" | "no") {
    if (vote) return;
    setVote(choice);
    setVotes((prev) => ({ ...prev, [choice]: prev[choice] + 1 }));
  }

  const total = votes.yes + votes.no;
  const yesPercent = Math.round((votes.yes / total) * 100);
  const noPercent = 100 - yesPercent;

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardDescription className="text-xs font-medium uppercase tracking-widest">
            Daily Dilemma
          </CardDescription>
          <CardTitle className="text-2xl sm:text-3xl">
            Is a hot dog a sandwich?
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {!vote ? (
            <div className="grid grid-cols-2 gap-3">
              <Button
                size="lg"
                className="h-14 text-lg"
                onClick={() => handleVote("yes")}
              >
                Yes
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 text-lg"
                onClick={() => handleVote("no")}
              >
                No
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <ResultBar
                label="Yes"
                percent={yesPercent}
                isWinner={yesPercent >= noPercent}
                isSelected={vote === "yes"}
              />
              <ResultBar
                label="No"
                percent={noPercent}
                isWinner={noPercent > yesPercent}
                isSelected={vote === "no"}
              />
              <p className="text-center text-sm text-muted-foreground">
                {total.toLocaleString()} votes
              </p>
            </div>
          )}
        </CardContent>
      </Card>
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

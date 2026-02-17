"use client";

import { useEffect, useState } from "react";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("cookie-consent")) {
      setVisible(true);
    }
  }, []);

  function accept() {
    localStorage.setItem("cookie-consent", "accepted");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-4 sm:flex-row sm:justify-between">
        <p className="text-center text-xs text-muted-foreground sm:text-left">
          We use cookies for anonymous session tracking and analytics.
          No personal data is collected.{" "}
          <a href="/privacy" className="underline hover:text-foreground">
            Privacy policy
          </a>
        </p>
        <button
          onClick={accept}
          className="shrink-0 cursor-pointer rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

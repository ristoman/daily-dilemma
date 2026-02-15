"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init("phc_PZGecRZUNUXFal2eVnZxTJJxM5g5shr2Xe1UC7Bmx9y", {
      api_host: "/ingest",
      ui_host: "https://eu.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

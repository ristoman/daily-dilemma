import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Daily Dilemma",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <a
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to Daily Dilemma
      </a>
      <h1 className="mb-8 text-3xl font-extrabold">Privacy Policy</h1>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-lg font-bold text-foreground">
            What we collect
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Session cookie</strong> — a
              random ID stored in an HTTP-only cookie to remember your votes.
              It contains no personal information.
            </li>
            <li>
              <strong className="text-foreground">Anonymous analytics</strong>{" "}
              — we use PostHog (EU servers) to track page views, votes, and
              shares. No names, emails, or IP addresses are stored in our
              database.
            </li>
            <li>
              <strong className="text-foreground">Feedback</strong> — if you
              submit feedback, the message text is stored alongside your
              anonymous session ID.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-foreground">
            What we don&apos;t collect
          </h2>
          <p>
            We don&apos;t collect your name, email address, phone number, IP
            address, or any other personally identifiable information. There is
            no account system and no login.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-foreground">Cookies</h2>
          <p>
            We use two types of cookies:
          </p>
          <ul className="list-disc space-y-1 pl-5 mt-1">
            <li>
              <strong className="text-foreground">Session cookie</strong>{" "}
              (<code className="text-xs">daily-dilemma-session</code>) —
              prevents duplicate votes. Expires after 1 year.
            </li>
            <li>
              <strong className="text-foreground">Analytics cookies</strong> —
              set by PostHog for anonymous usage tracking. Hosted on EU servers.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-foreground">
            Your rights
          </h2>
          <p>
            Under the GDPR and similar privacy regulations, you have the right
            to request access to, correction of, or deletion of any data
            associated with your session.
          </p>
          <p className="mt-2">
            Since we only store an anonymous session ID, deleting your browser
            cookies effectively removes the link between you and your data.
            You can also use the in-app reset feature to clear your vote
            history.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-foreground">
            Data removal requests
          </h2>
          <p>
            If you&apos;d like us to delete all data associated with your
            session from our database, email us at{" "}
            <a
              href="mailto:privacy@dilemma.day"
              className="font-medium text-foreground underline"
            >
              privacy@dilemma.day
            </a>
            . Include your session ID if possible (check your browser cookies
            for <code className="text-xs">daily-dilemma-session</code>), and
            we&apos;ll remove all associated records.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-foreground">Contact</h2>
          <p>
            For any privacy-related questions, reach out to{" "}
            <a
              href="mailto:privacy@dilemma.day"
              className="font-medium text-foreground underline"
            >
              privacy@dilemma.day
            </a>
            .
          </p>
        </section>

        <p className="pt-4 text-xs text-muted-foreground/60">
          Last updated: February 2026
        </p>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { AlertTriangleIcon } from "@/components/ui/icons";

/**
 * Route-level error boundary. Next 16 passes `unstable_retry`, which re-fetches
 * and re-renders the segment; `reset` only clears the boundary, so retry is
 * preferred when available.
 */
export default function RouteError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="shell page-shell status-page" id="main">
      <span className="status-page__icon status-page__icon--danger">
        <AlertTriangleIcon size={24} />
      </span>
      <p className="eyebrow">Something went wrong</p>
      <h1 className="status-page__title">This page could not be loaded.</h1>
      <p className="status-page__body">
        The problem has been logged. Trying again usually resolves a temporary
        network or database hiccup.
        {error.digest ? (
          <>
            {" "}
            Reference <code>{error.digest}</code>.
          </>
        ) : null}
      </p>
      <div className="status-page__actions">
        <Button onClick={() => (unstable_retry ?? reset)()} variant="primary">
          Try again
        </Button>
        <ButtonLink href="/library" variant="secondary">
          Open your library
        </ButtonLink>
      </div>
    </main>
  );
}

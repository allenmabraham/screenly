import { exit } from "node:process";

import { getServerEnv } from "./env";

/**
 * Validates the environment before the first request. Next.js only logs a
 * failing instrumentation hook and keeps serving, so a production instance
 * stops itself to make the platform surface the failure (crash loop, failed
 * revision) instead of answering 500s.
 */
export function assertBootEnvironment() {
  try {
    getServerEnv();
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "fatal",
        message: "Screenly web cannot start with the current environment.",
        error: error instanceof Error ? error.message : String(error),
      }),
    );

    if (process.env.NODE_ENV === "production") {
      exit(1);
    }

    throw error;
  }
}

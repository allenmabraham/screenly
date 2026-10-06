/**
 * Runs once per server instance before any request is served. Validating the
 * environment here means a misconfigured deployment fails at boot with a clear
 * message instead of surfacing as scattered 500s on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { getServerEnv } = await import("@/lib/env");

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
    throw error;
  }
}

/**
 * Runs once per server instance before any request is served. Validating the
 * environment here means a misconfigured deployment fails at boot with a clear
 * message instead of surfacing as scattered 500s on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { assertBootEnvironment } = await import("@/lib/boot");
  assertBootEnvironment();
}

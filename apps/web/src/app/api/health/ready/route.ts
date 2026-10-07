import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import { getServerEnv } from "@/lib/env";
import { checkStorageConnectivity } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 5_000;

type CheckName = "environment" | "database" | "storage";
type CheckStatus = "ok" | "failed";

/**
 * Readiness probe: confirms the instance can actually serve traffic. Unlike
 * `/api/health` (liveness), this talks to PostgreSQL and object storage, so
 * point load balancer health checks here only when a dependency outage should
 * remove the instance from rotation.
 */
export async function GET() {
  const checks: Record<CheckName, CheckStatus> = {
    environment: "ok",
    database: "ok",
    storage: "ok",
  };

  try {
    getServerEnv();
  } catch (error) {
    checks.environment = "failed";
    logFailure("environment", error);
  }

  if (checks.environment === "ok") {
    const results = await Promise.allSettled([
      withTimeout(getDb().execute(sql`select 1`), "database"),
      withTimeout(checkStorageConnectivity(), "storage"),
    ]);

    for (const [index, name] of (["database", "storage"] as const).entries()) {
      const result = results[index]!;
      if (result.status === "rejected") {
        checks[name] = "failed";
        logFailure(name, result.reason);
      }
    }
  } else {
    checks.database = "failed";
    checks.storage = "failed";
  }

  const healthy = Object.values(checks).every((status) => status === "ok");

  return Response.json(
    {
      status: healthy ? "ok" : "unavailable",
      service: "screenly-web",
      checks,
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

async function withTimeout<T>(operation: Promise<T>, name: CheckName) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${name} check timed out after ${CHECK_TIMEOUT_MS}ms.`)),
      CHECK_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function logFailure(name: CheckName, error: unknown) {
  console.error(
    JSON.stringify({
      level: "error",
      message: "Readiness check failed.",
      check: name,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}

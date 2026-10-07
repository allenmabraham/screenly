import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

/**
 * Values copied verbatim from `.env.example`, `docker-compose.yml`, or local
 * tooling. They are fine for development but must never reach production.
 */
const PLACEHOLDER_SECRET_PATTERN = /replace-with|change-me|local-development|local-session|local-upload/i;

const booleanFlag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const serverEnvSchema = z.object({
  /**
   * Set only by the local Docker Compose stack, whose image runs with
   * NODE_ENV=production but intentionally uses throwaway credentials.
   */
  ALLOW_DEVELOPMENT_SECRETS: booleanFlag,
  APP_URL: z.url().optional(),
  CLOUD_SQL_INSTANCE: optionalString,
  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(500).default(5),
  DATABASE_URL: z.url(),
  GCP_PROCESSOR_JOB: optionalString,
  GCP_PROJECT_ID: optionalString,
  GCP_REGION: optionalString,
  GCP_SERVICE_ACCOUNT_KEY: optionalSecret,
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PROCESSOR_MODE: z
    .enum(["manual", "cloud-run-job", "worker-pool"])
    .default("manual"),
  RESEND_API_KEY: optionalSecret,
  RESEND_FROM_EMAIL: optionalString,
  SESSION_SECRET: z.string().min(32),
  SLACK_BOT_TOKEN: optionalSecret,
  SLACK_SIGNING_SECRET: optionalSecret,
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_BACKEND: z.enum(["gcs", "s3"]).default("s3"),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ENDPOINT: z.url().optional(),
  STORAGE_FORCE_PATH_STYLE: booleanFlag,
  STORAGE_PUBLIC_BASE_URL: z.url().optional(),
  STORAGE_REGION: z.string().min(1).default("auto"),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  UPLOAD_API_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cachedEnv) {
    cachedEnv = parseServerEnv(process.env);
  }

  return cachedEnv;
}

/**
 * Parses and cross-validates the server environment. Production deployments
 * additionally require an explicit `APP_URL` (share links and invitation
 * emails must never be derived from the request Host header) and reject
 * placeholder secrets copied from the example configuration.
 */
export function parseServerEnv(
  environment: Record<string, string | undefined>,
): ServerEnv {
  const env = serverEnvSchema.parse(environment);
  const problems: string[] = [];

  if (env.NODE_ENV === "production") {
    if (!env.APP_URL) {
      problems.push("APP_URL is required in production.");
    } else if (
      new URL(env.APP_URL).protocol !== "https:" &&
      !env.ALLOW_DEVELOPMENT_SECRETS
    ) {
      problems.push("APP_URL must use https in production.");
    }

    if (!env.ALLOW_DEVELOPMENT_SECRETS) {
      for (const [name, value] of [
        ["SESSION_SECRET", env.SESSION_SECRET],
        ["UPLOAD_API_TOKEN", env.UPLOAD_API_TOKEN],
        ["STORAGE_SECRET_ACCESS_KEY", env.STORAGE_SECRET_ACCESS_KEY],
      ] as const) {
        if (value && PLACEHOLDER_SECRET_PATTERN.test(value)) {
          problems.push(
            `${name} still contains a placeholder value from the example configuration.`,
          );
        }
      }
    }
  }

  if (env.PROCESSOR_MODE === "cloud-run-job") {
    for (const name of [
      "GCP_PROJECT_ID",
      "GCP_REGION",
      "GCP_PROCESSOR_JOB",
    ] as const) {
      if (!env[name]) {
        problems.push(`${name} is required when PROCESSOR_MODE=cloud-run-job.`);
      }
    }
  }

  if ((env.RESEND_API_KEY === undefined) !== (env.RESEND_FROM_EMAIL === undefined)) {
    problems.push(
      "RESEND_API_KEY and RESEND_FROM_EMAIL must be configured together.",
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid server environment:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`,
    );
  }

  return env;
}

/**
 * Returns the public origin used to build share links and invitation URLs.
 * Falls back to the request origin only outside production so local
 * development keeps working without configuration.
 */
export function getPublicAppUrl(request?: Request) {
  const configured = getServerEnv().APP_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (process.env.NODE_ENV === "production" || !request) {
    throw new Error("APP_URL must be configured.");
  }

  return new URL(request.url).origin;
}

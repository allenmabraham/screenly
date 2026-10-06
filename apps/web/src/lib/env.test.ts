import assert from "node:assert/strict";
import test from "node:test";

import { parseServerEnv } from "./env";

const baseEnvironment = {
  DATABASE_URL: "postgresql://screenly:secret@127.0.0.1:5432/screenly",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef",
  STORAGE_ACCESS_KEY_ID: "access",
  STORAGE_BUCKET: "screenly",
  STORAGE_SECRET_ACCESS_KEY: "a-real-looking-storage-secret",
};

test("development accepts the minimal configuration without APP_URL", () => {
  const env = parseServerEnv(baseEnvironment);

  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.APP_URL, undefined);
  assert.equal(env.PROCESSOR_MODE, "manual");
  assert.equal(env.DATABASE_MAX_CONNECTIONS, 5);
  assert.equal(env.STORAGE_FORCE_PATH_STYLE, false);
});

test("production requires an https APP_URL", () => {
  assert.throws(
    () => parseServerEnv({ ...baseEnvironment, NODE_ENV: "production" }),
    /APP_URL is required in production/,
  );
  assert.throws(
    () =>
      parseServerEnv({
        ...baseEnvironment,
        NODE_ENV: "production",
        APP_URL: "http://screenly.example.com",
      }),
    /APP_URL must use https/,
  );

  const env = parseServerEnv({
    ...baseEnvironment,
    NODE_ENV: "production",
    APP_URL: "https://screenly.example.com/",
  });
  assert.equal(env.APP_URL, "https://screenly.example.com/");
});

test("production rejects placeholder secrets from the example configuration", () => {
  assert.throws(
    () =>
      parseServerEnv({
        ...baseEnvironment,
        NODE_ENV: "production",
        APP_URL: "https://screenly.example.com",
        SESSION_SECRET: "replace-with-at-least-32-random-characters",
      }),
    /SESSION_SECRET still contains a placeholder/,
  );
  assert.throws(
    () =>
      parseServerEnv({
        ...baseEnvironment,
        NODE_ENV: "production",
        APP_URL: "https://screenly.example.com",
        UPLOAD_API_TOKEN: "screenly-local-upload-token-change-me-padded",
      }),
    /UPLOAD_API_TOKEN still contains a placeholder/,
  );
});

test("the local Docker stack can opt into development secrets explicitly", () => {
  const env = parseServerEnv({
    ...baseEnvironment,
    NODE_ENV: "production",
    ALLOW_DEVELOPMENT_SECRETS: "true",
    APP_URL: "http://localhost:3000",
    SESSION_SECRET: "screenly-local-session-secret-change-me",
  });

  assert.equal(env.ALLOW_DEVELOPMENT_SECRETS, true);
  assert.equal(env.APP_URL, "http://localhost:3000");
});

test("short session secrets and upload tokens are rejected", () => {
  assert.throws(
    () => parseServerEnv({ ...baseEnvironment, SESSION_SECRET: "short" }),
    /SESSION_SECRET/,
  );
  assert.throws(
    () => parseServerEnv({ ...baseEnvironment, UPLOAD_API_TOKEN: "short" }),
    /UPLOAD_API_TOKEN/,
  );
  assert.equal(
    parseServerEnv({ ...baseEnvironment, UPLOAD_API_TOKEN: "" }).UPLOAD_API_TOKEN,
    undefined,
  );
});

test("the Cloud Run Job processor mode requires its dispatch settings", () => {
  assert.throws(
    () =>
      parseServerEnv({ ...baseEnvironment, PROCESSOR_MODE: "cloud-run-job" }),
    /GCP_PROJECT_ID is required[\s\S]*GCP_REGION is required[\s\S]*GCP_PROCESSOR_JOB is required/,
  );

  const env = parseServerEnv({
    ...baseEnvironment,
    PROCESSOR_MODE: "cloud-run-job",
    GCP_PROJECT_ID: "project",
    GCP_REGION: "us-central1",
    GCP_PROCESSOR_JOB: "screenly-processor",
  });
  assert.equal(env.PROCESSOR_MODE, "cloud-run-job");
});

test("Resend delivery settings must be configured together", () => {
  assert.throws(
    () => parseServerEnv({ ...baseEnvironment, RESEND_API_KEY: "re_123" }),
    /RESEND_API_KEY and RESEND_FROM_EMAIL/,
  );
  assert.doesNotThrow(() =>
    parseServerEnv({
      ...baseEnvironment,
      RESEND_API_KEY: "re_123",
      RESEND_FROM_EMAIL: "Screenly <screenly@example.com>",
    }),
  );
});

test("empty optional values are treated as unset", () => {
  const env = parseServerEnv({
    ...baseEnvironment,
    SLACK_BOT_TOKEN: "",
    SLACK_SIGNING_SECRET: "",
    RESEND_API_KEY: "",
    RESEND_FROM_EMAIL: "",
    CLOUD_SQL_INSTANCE: "",
  });

  assert.equal(env.SLACK_BOT_TOKEN, undefined);
  assert.equal(env.SLACK_SIGNING_SECRET, undefined);
  assert.equal(env.RESEND_API_KEY, undefined);
  assert.equal(env.CLOUD_SQL_INSTANCE, undefined);
});

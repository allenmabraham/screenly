# Screenly

Screenly is an internal, low-friction screen recorder and sharing service. The
native macOS recorder and the Windows and Linux desktop recorder create a share
link before their upload starts so the link can be pasted into Slack
immediately while the viewer displays a live processing state.

The repository contains the complete application foundation: the web product,
desktop recorders, resumable upload path, and ffmpeg processing job. Open
[`/v/demo1234`](http://localhost:3000/v/demo1234) to view the built-in demo
without configuring external services.

## Architecture

```text
apps/
  web/        Next.js App Router UI and HTTP API
  mac/        Native Swift/SwiftUI menu bar recorder
  desktop/    Electron tray recorder for Windows and Linux
  worker/     TypeScript ffmpeg worker-pool / one-shot processor
```

Production is designed around:

- **Cloud Run service:** public Next.js viewer and authenticated upload API
- **Cloud SQL for PostgreSQL:** video metadata, tokens, and processing leases
- **Cloud Storage:** source recordings and processed media
- **Cloud Run worker pool:** one warm ffmpeg processor that claims completed
  uploads from PostgreSQL without a per-video cold start
- **macOS distribution:** signed and notarized universal DMG from the web
  application’s download page
- **Windows and Linux distribution:** NSIS installer, AppImage, and `.deb`
  published to the same release bucket and offered on the same page

No recording bytes pass through the Next.js service. The API creates a video
record and share slug, then issues short-lived presigned multipart URLs so the
recorders upload directly to Cloud Storage. The storage integration uses Cloud
Storage's S3-compatible XML API and HMAC credentials, preserving the recorder's
resumable multipart protocol.

The macOS recorder writes microphone and system audio as separate source
tracks; the Windows and Linux recorder mixes them into one Opus track while
recording. The processing job produces one AAC track for consistent browser
playback either way.

## Local development

Requirements:

- Node.js 22 or newer
- pnpm 11 through Corepack
- PostgreSQL or a Cloud SQL instance reached through the Cloud SQL Auth Proxy
- Docker, if using the included local MinIO object store

Install dependencies:

```bash
corepack enable
pnpm install
```

Copy the example configuration and replace the PostgreSQL connection string:

```bash
cp .env.example apps/web/.env.local
pnpm db:migrate
pnpm user:bootstrap
pnpm dev
```

The application runs at `http://localhost:3000`. MinIO can be started
independently with:

```bash
docker compose up minio minio-init
```

Its S3 endpoint is `http://localhost:9000` and its console is available at
`http://localhost:9001`.

## Upload API

Recorder endpoints require a per-recorder token created from
`/library/tokens`:

```http
Authorization: Bearer <RECORDER_TOKEN>
```

The Mac, Windows, and Linux recorders all use this flow. The resumable flow
is:

1. `POST /api/uploads` with the file name, MIME type, and byte size.
2. Copy the returned `shareUrl` to the clipboard immediately.
3. `POST /api/uploads/:videoId/parts` with up to 100 part numbers.
4. Upload each part directly to its presigned URL and retain its `ETag`.
5. `POST /api/uploads/:videoId/complete` with all part numbers and ETags.
6. Poll `GET /api/videos/:slug` until its status is `ready` or `failed`.

An active multipart upload can be discarded with
`DELETE /api/uploads/:videoId`. The public viewer is `/v/:slug`.

Only SHA-256 token hashes are stored in PostgreSQL. Tokens can be independently
revoked without affecting uploaded recordings. `UPLOAD_API_TOKEN` remains as
an optional bootstrap/recovery credential and should not be installed on team
devices.

## Processing progress

After upload, the processor reports its current phase, percentage, heartbeat,
and estimated time remaining to the video record. Transfer estimates use
observed byte throughput, while ffmpeg estimates use the recording timestamp
and live encoding speed. The public viewer polls these measurements and updates
automatically.

In production, an always-on Cloud Run worker pool polls for completed uploads
and normally claims one within `WORKER_POLL_INTERVAL_MS` (one second by
default). The older Cloud Run Job mode remains available when scaling to zero
is more important than startup latency.

The viewer intentionally says **Queued**, **Estimating time**, or **Processor
update delayed** when it does not have enough current data. It does not invent
an ETA before the worker has measured the recording. Existing videos and jobs
created before the progress migration continue to use these fallback states.

While the viewer is waiting it shows the pipeline as a four-step tracker
(**Upload → Optimize → Preview → Ready**) with the worker's real stage,
percentage and estimate. Polling stops entirely while the browser tab is hidden
and resumes with an immediate refresh when the viewer comes back, so a
backgrounded share link costs nothing.

## Web UI and design system

The web interface is built from one static stylesheet and a small set of
primitives. There is no runtime styling library, so styles cost nothing to
execute and ship as a single cacheable file (~64 kB, ~13 kB compressed).

```text
apps/web/src/styles/
  tokens.css      colour, type, space, radius, elevation and motion tokens
  base.css        element defaults, focus rings, ambient background, utilities
  primitives.css  buttons, fields, badges, cards, menus, toasts, skeletons
  shell.css       headers, footer, page headings, settings nav, status pages
  viewer.css      video stage, player chrome, processing and failure states
  library.css     toolbar, recording grid, cards, who-watched popover
  auth.css / download.css / settings.css / marketing.css   per-screen layers
apps/web/src/components/
  ui/             design-system primitives (Button, Menu, Toast, Badge, …)
  layout/         SiteHeader, AppHeader, SiteFooter, SettingsNav
  library/ video/ settings/ auth/ marketing/   feature components
```

Conventions worth knowing before changing the UI:

- **Semantic classes, not utilities.** Components reference classes such as
  `btn btn--primary` or `vcard__title`. Tailwind is still installed and the
  tokens are exposed to it through `@theme inline`, but no utility classes are
  used in application code.
- **Theming.** Light values live on `:root`, dark values in a single
  `[data-theme="dark"]` block. A small inline script in the root layout resolves
  the stored preference (`screenly-theme`: `system`, `light` or `dark`) before
  first paint, so there is no flash of the wrong theme. The three-state control
  lives in the header, and in the user menu on small screens.
- **Server components by default.** Only leaves that need browser APIs are
  `"use client"`: the theme toggle, workspace and user menus, library toolbar,
  video card actions, player, processing state, toasts and copy buttons. Marketing
  and auth pages therefore ship almost no client JavaScript.
- **Non-component exports must not live in `"use client"` modules.** They become
  client references and cannot be read on the server, which is why
  `lib/library-url.ts` and `components/video/player-shortcuts.ts` are separate.
- **The player is progressive enhancement.** The server renders
  `<video controls>`; the custom control bar replaces the native controls after
  hydration. No-JavaScript visitors and the Slack embed keep a working player.
  Playback progress is painted from a `requestAnimationFrame` loop that writes a
  composited transform straight to the DOM, so playing a video causes no React
  re-render per frame, and the loop stops while the tab is hidden.
- **Images.** Thumbnails are plain `<img>` elements with intrinsic dimensions:
  the URLs are presigned and rotate hourly, so `next/image` would re-optimise
  them constantly for no benefit. The first row loads eagerly for the largest
  contentful paint; the rest are lazy. Hover previews reuse the animated
  `preview.webp` the processor already generates, fetched on demand from
  `/api/library/videos/:videoId/preview` and skipped for reduced-motion,
  save-data and touch users.
- **Expensive effects are rationed.** `backdrop-filter` is limited to the sticky
  header and the player's centre play button, both behind `@supports`. The
  ambient gradient is one fixed layer rather than `background-attachment: fixed`,
  which repaints the viewport on every scroll frame.

Accessibility is part of the definition of done: axe-core reports no violations
across every route in both themes at 1440px and 390px, all interactive elements
have visible focus rings, menus trap focus and return it to their trigger, and
every route is operable with the keyboard alone.

## Slack inline playback

Slack only renders inline video from custom providers through an installed
Slack app; Open Graph video tags alone produce a static preview. Screenly's
Slack app listens for `link_shared` events and responds with a Block Kit video
unfurl. Links pasted while a recording is uploading or processing first show a
status card, then update in place when the worker marks the video ready.

This internal deployment uses one environment-configured Slack installation:

1. Copy `slack-app-manifest.example.yml` and replace every
   `screenly.example.com` value with the HTTPS hostname in `APP_URL`.
2. Create a Slack app **from an app manifest**. Copy its signing secret to the
   web service as `SLACK_SIGNING_SECRET`; URL verification only needs this
   secret and can run before the app is installed.
3. Confirm Slack verifies
   `https://YOUR_HOST/api/integrations/slack/events` as the Events API request
   URL.
4. Install the app to the workspace, approve `links:read`, `links:write`, and
   `links.embed:write`, then store the installed bot token as
   `SLACK_BOT_TOKEN` on both the web service and processor runtime.

The unfurl player is `/embed/v/:slug`. It deliberately contains only the video
player and must remain iframe-compatible: do not add `X-Frame-Options` or a
`frame-ancestors` policy that excludes Slack. If links stay collapsed, confirm
the app is installed, the exact share hostname is in **App Unfurl Domains**, and
the workspace administrator has not blocked previews for that hostname.

## Users and workspaces

Browser and native-device access use individual username/password accounts.
There is no open signup: owners and admins invite users from
`/library/members`, and invitees create an account (or authenticate their
existing account) from the emailed link. Usernames and email addresses are
stored normalized to lowercase. Passwords use Node.js scrypt, browser cookies
are HMAC-signed, and native device sessions store only SHA-256 token hashes.

After applying migrations, bootstrap the first owner and fixed default
workspace:

```bash
export OWNER_USERNAME=admin
export OWNER_EMAIL=admin@example.com
export OWNER_PASSWORD='at-least-12-characters'
export WORKSPACE_NAME='Screenly'
pnpm user:bootstrap
```

The bootstrap command is idempotent and never prints the password. Configure
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `APP_URL` to deliver invitation
emails. If Resend is not configured, invitation creation still returns a
copyable `inviteUrl` and records failed delivery.

Native clients sign in with `POST /api/auth/device/session` using
`username`, `password`, and `deviceName`. The response contains
`sessionToken`, `sessionExpiresAt`, `user`, `workspaces`, `activeWorkspace`,
and a one-time `recorderToken` object. A bearer user-session token can read the
current `user` and `workspaces` with `GET` on the same route or revoke itself
with `DELETE`. `POST /api/auth/device/workspace` accepts `workspaceId` and
`deviceName`, then returns `activeWorkspace` and a newly minted
workspace-scoped `recorderToken`.

Every member signs in at `/login` (the home, download, and viewer pages all
link to it) to browse the workspace library, rename or delete recordings, and
see who watched each one. Videos uploaded through a signed-in recorder are
attributed to that user, which powers the library's "My recordings" filter.

## Watch analytics

Each `/v/:slug` playback increments the video's total view count. When the
viewer also has a Screenly session cookie, the view is recorded in the
`video_views` table (one row per user per video with a watch count and
last-viewed timestamp). Members can open the view counter on any library card
to see named viewers; signed-out plays are shown as anonymous views, and no
viewer identity is collected from people without an account.
`GET /api/library/videos/:videoId/views` returns
`{ viewCount, viewers: [{ viewerName, watchCount, lastViewedAt }] }` for
members of the video's workspace.

## Database changes

Drizzle migrations live in `apps/web/drizzle`.

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

Generate migrations after editing `apps/web/src/db/schema.ts`; apply committed
migrations during deployment before promoting a new application revision.
The multi-workspace migration creates the fixed default workspace
`00000000-0000-4000-8000-000000000001`, backfills every existing video and
recorder token to it, and only then makes both workspace columns non-null.
Video IDs, slugs, and object keys are unchanged.

## Docker

Build and run the complete local container stack:

```bash
docker compose up --build
```

The web image is a non-root, Next.js standalone production image. The Compose
stack includes PostgreSQL and MinIO for development. On a new PostgreSQL volume,
the committed migrations run in file-name order during database initialization.
The `web` service waits on `/api/health/ready`, so it is reported healthy only
once PostgreSQL and MinIO answer, and it sets `ALLOW_DEVELOPMENT_SECRETS=true`
because the image otherwise refuses the stack's placeholder credentials.

To process one uploaded video locally, install ffmpeg or run the worker profile:

```bash
VIDEO_ID=<database-video-uuid> docker compose --profile processor run --rm worker
```

## Production configuration and hardening

The web service validates its whole environment once at boot
(`apps/web/src/instrumentation.ts`). With `NODE_ENV=production` an instance
logs a `fatal` entry and exits with status 1 instead of serving requests
when:

- `APP_URL` is missing or is not an `https` URL. Share links, invitation
  emails and Slack unfurls are built from this value only; the request `Host`
  header is used solely in development.
- `SESSION_SECRET`, `UPLOAD_API_TOKEN` or `STORAGE_SECRET_ACCESS_KEY` still
  contains a placeholder copied from `.env.example` or `docker-compose.yml`.
- `SESSION_SECRET` is shorter than 32 characters, or `UPLOAD_API_TOKEN` is
  set and shorter than 32 characters.
- `PROCESSOR_MODE=cloud-run-job` without `GCP_PROJECT_ID`, `GCP_REGION` and
  `GCP_PROCESSOR_JOB`.
- Only one of `RESEND_API_KEY` and `RESEND_FROM_EMAIL` is set.

On Cloud Run this surfaces as a failed revision rollout; on Vercel the
function logs the same message and the request fails. The local Compose stack
sets `ALLOW_DEVELOPMENT_SECRETS=true` to keep its throwaway credentials; never
set that variable on a real deployment.

Every response carries `Strict-Transport-Security`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, and a
`Permissions-Policy` that disables camera, microphone and screen capture in
the browser (recording happens in the native apps). All routes except the
Slack unfurl player under `/embed/` also send `X-Frame-Options: DENY` and
`Content-Security-Policy: frame-ancestors 'none'`. The `x-powered-by` header
is disabled.

Browser sign-in (`POST /api/auth/session`), device sign-in
(`POST /api/auth/device/session`) and invitation acceptance
(`POST /api/auth/invitations/:token`) are rate limited: ten failed attempts
per account in fifteen minutes, or thirty failed attempts per client address
in ten minutes, answer `429` with a `Retry-After` header until the window
passes. A successful sign-in clears the account's counter. The counters live
in process memory, so the per-address allowance scales with the number of
running instances; the per-account limit is what protects an individual
account, together with the scrypt cost of each attempt.

Before routing production traffic, confirm each of the following, none of
which the repository can provide:

- Secret Manager (or Vercel environment) entries for `DATABASE_URL`,
  `SESSION_SECRET`, the storage HMAC pair, and optionally `UPLOAD_API_TOKEN`,
  `RESEND_API_KEY`, `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET`, each
  generated rather than copied from an example.
- DNS and TLS for the `APP_URL` hostname, and that hostname registered in the
  Slack app's **App Unfurl Domains** when Slack playback is wanted.
- A verified Resend sender for `RESEND_FROM_EMAIL`, otherwise invitations are
  created with a copyable link and recorded as undelivered.
- A private bucket with uniform access, the HMAC key described below, and the
  incomplete-multipart lifecycle rule described above.
- Apple Developer ID and notarization credentials for the macOS release
  workflow, and optionally a Windows code-signing certificate; without them
  the workflows build unsigned verification artifacts and skip publishing.

## Google Cloud

The production runtime uses a Cloud Run worker pool, Cloud SQL for PostgreSQL,
Cloud Storage, Artifact Registry, and Secret Manager. Enable their APIs:

```bash
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com
```

Create an Artifact Registry Docker repository named `screenly`, then build and
push both images with Cloud Build:

```bash
gcloud artifacts repositories create screenly \
  --repository-format docker \
  --location us-central1

gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions=_WEB_IMAGE=us-central1-docker.pkg.dev/PROJECT_ID/screenly/web,_WORKER_IMAGE=us-central1-docker.pkg.dev/PROJECT_ID/screenly/worker
```

Create a Cloud SQL for PostgreSQL instance, database, and password-based
application user. `DATABASE_URL` carries the database name and credentials;
`CLOUD_SQL_INSTANCE` makes the app replace its URL host with Cloud Run's Unix
socket. URL-encode the password before placing it in the URL.

Create a private Cloud Storage bucket with uniform bucket-level access. The
recorder's direct multipart uploads use the Cloud Storage XML API, so create an
HMAC key for a dedicated storage service account with
`roles/storage.objectAdmin` on only that bucket. Store the HMAC access ID and
secret in Secret Manager as `storage-access-key-id` and
`storage-secret-access-key`. HMAC credentials are required for the current
presigned multipart protocol; Cloud Run's attached identity alone cannot sign
those S3-compatible requests.

Create separate runtime service accounts for the web service and processor.
Grant both `roles/cloudsql.client`, and give each identity Secret Manager access
only to the secrets it consumes.

Create one warm processor with a Cloud Run worker pool. Worker pools perform
continuous non-HTTP work and do not scale automatically; `--instances 1` keeps
one processor ready instead of provisioning a new container for every video:

```bash
gcloud run worker-pools deploy screenly-processor-pool \
  --image us-central1-docker.pkg.dev/PROJECT_ID/screenly/worker:latest \
  --region us-central1 \
  --service-account screenly-processor@PROJECT_ID.iam.gserviceaccount.com \
  --set-cloudsql-instances PROJECT_ID:us-central1:screenly \
  --instances 1 \
  --cpu 1 \
  --memory 512Mi \
  --set-env-vars APP_URL=https://screenly.example.com,CLOUD_SQL_INSTANCE=PROJECT_ID:us-central1:screenly,STORAGE_BACKEND=gcs,STORAGE_BUCKET=BUCKET_NAME,HLS_THRESHOLD_SECONDS=1200,WORKER_POLL_INTERVAL_MS=1000,PROCESSING_MAX_ATTEMPTS=4 \
  --set-secrets DATABASE_URL=database-url:latest,STORAGE_ACCESS_KEY_ID=storage-access-key-id:latest,STORAGE_SECRET_ACCESS_KEY=storage-secret-access-key:latest,SLACK_BOT_TOKEN=slack-bot-token:latest
```

Do not set `VIDEO_ID` on the worker pool. Without it, the worker continuously
claims the oldest completed upload. Start with the same CPU and memory that are
known to process recordings successfully, then tune those limits from Cloud
Monitoring if needed.

Size the processor's memory against the largest recording it must handle. The
worker stages the source download, the transcoded MP4, the preview assets and
any HLS segments under `PROCESSING_TEMP_DIR` (`/tmp/screenly` by default), and
on Cloud Run `/tmp` is an in-memory filesystem that counts toward the
instance's memory limit. A 512 MiB instance therefore cannot process a
recording much larger than ~150 MB. Either raise `--memory` to roughly three
times the largest expected source file, or mount a volume with
`--add-volume` / `--add-volume-mount` and point `PROCESSING_TEMP_DIR` at it so
scratch files leave the memory budget. Before downloading, the worker compares
the recording's size against the free space in `PROCESSING_TEMP_DIR` and fails
the attempt with an `Insufficient scratch space` error that names both
numbers, so an undersized processor shows up as a clear `processing_error`
rather than a series of out-of-memory restarts. Recordings that pass the check
but still need more room for transcoding or HLS packaging can still exhaust
the limit, which is why the memory should be sized generously. Google Cloud's current pricing example for one
1-vCPU/512-MiB worker-pool instance in a standard region is about $11.61 per
month after its listed free tier; actual region, account-wide free-tier usage,
and resource limits change that amount. Every additional instance adds
parallel processing capacity and continuous cost.

Deploy the web image as an unauthenticated service so possession of a share
link is sufficient to watch a recording:

```bash
gcloud run deploy screenly-web \
  --image us-central1-docker.pkg.dev/PROJECT_ID/screenly/web:latest \
  --region us-central1 \
  --port 3000 \
  --service-account screenly-web@PROJECT_ID.iam.gserviceaccount.com \
  --set-cloudsql-instances PROJECT_ID:us-central1:screenly \
  --allow-unauthenticated \
  --set-env-vars APP_URL=https://screenly.example.com,PROCESSOR_MODE=worker-pool,CLOUD_SQL_INSTANCE=PROJECT_ID:us-central1:screenly,STORAGE_BACKEND=gcs,STORAGE_BUCKET=BUCKET_NAME \
  --set-secrets DATABASE_URL=database-url:latest,SESSION_SECRET=session-secret:latest,STORAGE_ACCESS_KEY_ID=storage-access-key-id:latest,STORAGE_SECRET_ACCESS_KEY=storage-secret-access-key:latest,SLACK_BOT_TOKEN=slack-bot-token:latest,SLACK_SIGNING_SECRET=slack-signing-secret:latest
```

For a lower idle bill at the cost of a cold start for every recording, retain
the one-shot Cloud Run Job mode instead:

```bash
gcloud run jobs deploy screenly-processor \
  --image us-central1-docker.pkg.dev/PROJECT_ID/screenly/worker:latest \
  --region us-central1 \
  --service-account screenly-processor@PROJECT_ID.iam.gserviceaccount.com \
  --set-cloudsql-instances PROJECT_ID:us-central1:screenly \
  --tasks 1 \
  --max-retries 4 \
  --task-timeout 3600s \
  --set-env-vars APP_URL=https://screenly.example.com,CLOUD_SQL_INSTANCE=PROJECT_ID:us-central1:screenly,STORAGE_BACKEND=gcs,STORAGE_BUCKET=BUCKET_NAME,HLS_THRESHOLD_SECONDS=1200 \
  --set-secrets DATABASE_URL=database-url:latest,STORAGE_ACCESS_KEY_ID=storage-access-key-id:latest,STORAGE_SECRET_ACCESS_KEY=storage-secret-access-key:latest,SLACK_BOT_TOKEN=slack-bot-token:latest

gcloud run jobs add-iam-policy-binding screenly-processor \
  --region us-central1 \
  --member serviceAccount:screenly-web@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/run.jobsExecutorWithOverrides
```

Set the web environment to `PROCESSOR_MODE=cloud-run-job`,
`GCP_PROJECT_ID`, `GCP_REGION`, and `GCP_PROCESSOR_JOB` when using this
fallback. The fifth task run provides a cleanup pass if all four processing
attempts terminate abruptly before they can update the video row.

Store `DATABASE_URL`, `SESSION_SECRET`, the optional bootstrap
`UPLOAD_API_TOKEN`, `RESEND_API_KEY`, Slack bot token/signing secret, and HMAC
credentials in Secret Manager.
Set `RESEND_FROM_EMAIL` to a verified sender. Apply the committed Drizzle
migrations through the Cloud SQL Auth Proxy and bootstrap the first owner before
routing traffic to a schema-dependent revision:

```bash
cloud-sql-proxy PROJECT_ID:us-central1:screenly --port 5432
export DATABASE_URL='postgresql://screenly:PASSWORD@127.0.0.1:5432/screenly'
pnpm db:migrate
OWNER_USERNAME=admin \
OWNER_EMAIL=admin@example.com \
OWNER_PASSWORD='at-least-12-characters' \
WORKSPACE_NAME=Screenly \
pnpm user:bootstrap
```

Two health endpoints are available. `/api/health` is a liveness probe that
only confirms the process answers. `/api/health/ready` is a readiness probe
that validates the environment, runs `select 1` against PostgreSQL, and lists
one object from the bucket, returning `503` with a per-check breakdown when a
dependency is unavailable; use it for load balancer health checks and for the
Compose `healthcheck`. Set `DATABASE_MAX_CONNECTIONS` conservatively per
Cloud Run instance (the default is 5); each processor instance uses one
connection.

Add a lifecycle rule to the bucket that aborts incomplete multipart uploads
after a few days. The API aborts uploads that recorders discard or that
members delete from the library, but a recorder that loses power mid-upload
never sends either request, and the orphaned parts are billed until the
bucket cleans them up.

The worker pool atomically claims queued rows with PostgreSQL
`FOR UPDATE SKIP LOCKED`. Database leases prevent duplicate instances from
processing the same video and recover work after an interrupted instance. The
processor probes compatibility, mixes audio when needed, creates MP4,
thumbnail, animated preview and optional HLS assets, then atomically marks the
video ready. A one-shot job receives a `VIDEO_ID` override and uses the same
pipeline.

## Continuous deployment

Every pull request runs the `CI` workflow (`.github/workflows/ci.yml`): a
production dependency audit that fails on high or critical advisories,
`pnpm test`, `lint`, `typecheck`, both builds, the desktop bundle, a Compose
configuration check, and both container image builds with a boot smoke test
of each image. Nothing is deployed from pull requests.

Production is split between two platforms:

- **Web app → Vercel.** The `screenly` Vercel project builds `apps/web`
  (Root Directory `apps/web`) from the Git integration, so every merge to
  `main` deploys automatically and every pull request gets a preview URL.
- **Everything else → GitHub Actions.** The `Deploy backend` workflow
  (`.github/workflows/backend-deploy.yml`) runs on every push to `main`:
  it verifies the change (`pnpm test`, `lint`, `typecheck`, `build`),
  applies Drizzle migrations to the production database, optionally triggers
  the Vercel production deploy through a Deploy Hook (so schema changes land
  before the new web build), and rebuilds/updates the `screenly-processor`
  worker image and updates the warm `screenly-processor-pool`. Set the
  `PROCESSOR_RUNTIME` repository variable to `job` only when intentionally
  using the scale-to-zero Cloud Run Job fallback.

### Vercel setup

1. Connect the repository to the `screenly` project (Project Settings → Git).
2. Add the production environment variables: `DATABASE_URL`,
   `SESSION_SECRET`, `APP_URL` (the production URL), `STORAGE_BACKEND=gcs`,
   `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`,
   `PROCESSOR_MODE=worker-pool`, and optionally
   `UPLOAD_API_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
   `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, and the `MAC_APP_*` values.
3. Optional ordering guarantee: create a Deploy Hook (Project Settings →
   Git → Deploy Hooks), store it as the `VERCEL_DEPLOY_HOOK_URL` repository
   secret, and turn off automatic production deploys for pushes; the backend
   workflow then triggers the web deploy only after migrations succeed.

The worker-pool mode needs no Google dispatch credentials in the web
application. Only the Cloud Run Job fallback needs `GCP_PROJECT_ID`,
`GCP_REGION`, `GCP_PROCESSOR_JOB`, and a `GCP_SERVICE_ACCOUNT_KEY` service
account key JSON when the web app runs outside Google Cloud. Create that
minimal-scope fallback account with:

```bash
gcloud iam service-accounts create screenly-dispatch
gcloud run jobs add-iam-policy-binding screenly-processor \
  --region us-central1 \
  --member serviceAccount:screenly-dispatch@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/run.jobsExecutorWithOverrides
gcloud iam service-accounts keys create dispatch-key.json \
  --iam-account screenly-dispatch@PROJECT_ID.iam.gserviceaccount.com
```

Paste the contents of `dispatch-key.json` as `GCP_SERVICE_ACCOUNT_KEY` only
when `PROCESSOR_MODE=cloud-run-job`.

### Backend workflow setup

Add the `DATABASE_URL` repository secret to enable migrations (a managed
Postgres connection string such as Neon works directly; only Cloud SQL needs
the extra `CLOUD_SQL_INSTANCE` variable and a `127.0.0.1:5432` URL). To let
the workflow update the worker image, set the `GCP_PROJECT_ID` and
`GCP_REGION` repository variables and authenticate with either:

- **Service account key (simplest):** create a `screenly-deployer` service
  account with `roles/run.admin` and `roles/artifactregistry.writer` on the
  project plus `roles/iam.serviceAccountUser` on the processor's runtime service
  account, then store its key JSON as the `GCP_DEPLOYER_KEY` repository
  secret.
- **Workload Identity Federation (keyless):** configure the pool/provider
  below and set the `GCP_WORKLOAD_IDENTITY_PROVIDER` and
  `GCP_DEPLOY_SERVICE_ACCOUNT` repository variables. One-time setup:

```bash
gcloud iam service-accounts create screenly-deployer

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member serviceAccount:screenly-deployer@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/run.admin
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member serviceAccount:screenly-deployer@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/artifactregistry.writer
# Only when the database is Cloud SQL:
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member serviceAccount:screenly-deployer@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/cloudsql.client
# Allow the deployer to act as the processor's runtime service account:
gcloud iam service-accounts add-iam-policy-binding \
  PROCESSOR_RUNTIME_SA@PROJECT_ID.iam.gserviceaccount.com \
  --member serviceAccount:screenly-deployer@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/iam.serviceAccountUser

gcloud iam workload-identity-pools create github \
  --location global
gcloud iam workload-identity-pools providers create-oidc github-actions \
  --location global \
  --workload-identity-pool github \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping google.subject=assertion.sub,attribute.repository=assertion.repository \
  --attribute-condition "assertion.repository == 'OWNER/screenly'"
gcloud iam service-accounts add-iam-policy-binding \
  screenly-deployer@PROJECT_ID.iam.gserviceaccount.com \
  --member "principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/OWNER/screenly" \
  --role roles/iam.workloadIdentityUser
```

Then configure these GitHub repository **variables**: `GCP_PROJECT_ID`,
`GCP_REGION` (for example `us-central1`),
`GCP_WORKLOAD_IDENTITY_PROVIDER`
(`projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-actions`),
`GCP_DEPLOY_SERVICE_ACCOUNT`
(`screenly-deployer@PROJECT_ID.iam.gserviceaccount.com`). The workflow updates
`screenly-processor-pool` by default; `CLOUD_RUN_WORKER_POOL` can override that
name. To intentionally use the scale-to-zero fallback, set
`PROCESSOR_RUNTIME=job`; `CLOUD_RUN_JOB` can override its default name,
`screenly-processor`.

The migration job skips itself without the `DATABASE_URL` secret and the
worker job skips itself until `GCP_PROJECT_ID` is configured, so the
workflow stays green on forks. The web app can also still be deployed as a
Cloud Run service from the Docker image (see the previous section) if
Vercel is not used; the image continues to build with standalone output.

### Migrating from the processing job

Use this order to avoid interrupting uploads:

1. Deploy `screenly-processor-pool` with one instance and the same image,
   service account, Cloud SQL connection, storage settings, and secrets as the
   existing job.
2. Confirm the pool stays running and logs `Warm processing worker pool
   started.`
3. If the pool has a non-default name, set the `CLOUD_RUN_WORKER_POOL`
   repository variable so later backend deployments update it.
4. Change the web service to `PROCESSOR_MODE=worker-pool` and redeploy it.
5. Upload a short canary and compare `uploaded_at` with
   `processing_started_at`; an idle pool should begin within a few seconds.
6. Keep the job for a short rollback window. Once validated, it can be removed
   and the web identity's job-execution permission can be revoked.

## macOS build and distribution

The recorder targets macOS 15 and requires Xcode 16.3 or newer. Building with
the Xcode 26 SDK (macOS 26 Tahoe) additionally enables the native Liquid Glass
appearance; on macOS 15, and in builds from older SDKs, the interface falls
back to standard translucent materials. The release workflow runs on
`macos-26` runners so published builds always include the glass appearance.
Recorder code changes, including automatic browser navigation after Stop, do
not reach installed Macs until a new DMG is built and published.
Generate the Xcode project from the committed specification:

```bash
brew install xcodegen
cd apps/mac
xcodegen generate
xcodebuild \
  -project Screenly.xcodeproj \
  -scheme Screenly \
  -configuration Debug \
  build
```

Set the signing team in Xcode for development. The production release script
archives with hardened runtime, creates and signs a DMG, submits it to Apple,
waits for notarization, staples the ticket, validates it, and emits a SHA-256
file:

```bash
export APPLE_ID=builds@example.com
export APPLE_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=ABCDE12345
export MAC_APP_VERSION=1.0.0
export MAC_BUILD_NUMBER=1
bash apps/mac/scripts/build-release.sh
```

For internal testing without Apple credentials, push an `internal-v*` tag such
as `internal-v0.1.0`. The workflow creates an ad-hoc-signed DMG and preserves it
as a GitHub Actions artifact without publishing it to the configured release
bucket. Gatekeeper does not trust ad-hoc signatures, so users must explicitly
approve the app with **Control-click → Open**. Use the notarized workflow above
before distributing outside the team.

On a `main` push that changes the recorder, the `Release macOS recorder`
workflow imports the Developer ID certificate, notarizes the version in
`apps/mac/project.yml`, and publishes versioned and `Screenly-latest.dmg`
objects to S3-compatible storage. The latest object includes version and
checksum metadata so the web download updates without a separate Vercel
environment change. When release credentials are incomplete, the workflow
falls back to an unsigned verification artifact and skips publishing instead
of failing the deployment. Configure these secrets to enable publishing:

- `APPLE_ID`, `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID`
- `MACOS_CERTIFICATE_P12_BASE64`, `MACOS_CERTIFICATE_PASSWORD`
- `MAC_RELEASE_STORAGE_ACCESS_KEY_ID`, `MAC_RELEASE_STORAGE_SECRET_ACCESS_KEY`

Configure repository variables `MAC_RELEASE_STORAGE_URI`,
`MAC_RELEASE_STORAGE_REGION`, and optional `MAC_RELEASE_STORAGE_ENDPOINT`.
For Cloud Storage use an `s3://BUCKET/releases` URI, region `auto`, and endpoint
`https://storage.googleapis.com`. Published releases download through
`/api/releases/macos/download` without web configuration; `MAC_APP_DOWNLOAD_URL`
overrides that link, and `MAC_APP_VERSION` and `MAC_APP_SHA256` remain fallbacks
for release objects published before metadata support. `/download` and
`/api/releases/macos/latest` expose the latest signed build.

## Windows and Linux build and distribution

`apps/desktop` is an Electron recorder with the same behavior as the macOS app:
a tray icon and control center, a global shortcut (**Alt+Shift+R** by
default), full-screen, window, and area capture, microphone and system audio,
a draggable webcam bubble, pause and resume, and the same device sign-in,
workspace switching, and resumable multipart upload. The share link is copied
to the clipboard and the viewer opens as soon as the upload is created.

Run it against a local server:

```bash
pnpm install
pnpm desktop
```

Sign in with a Screenly account, or use **Settings → Advanced → Manual server
configuration** with `http://localhost:3000` and a recorder token. Build
installers for the current operating system with:

```bash
pnpm --filter @screenly/desktop package:windows   # on Windows: NSIS .exe
pnpm --filter @screenly/desktop package:linux     # on Linux: AppImage and .deb
```

Upload, sign-in, and settings logic lives in Electron-free modules under
`apps/desktop/src/core` and is covered by `pnpm test`. The main process
(`src/main`) owns the tray, windows, shortcut, secure storage, and the recording
state machine. Capture runs in a hidden renderer (`src/renderer/pages/capture.ts`)
that feeds Chromium's `MediaRecorder` and streams chunks to disk, preferring
H.264 MP4 and falling back to WebM, which the processor also accepts.

Platform behavior worth knowing:

- **Windows.** System audio is captured through WASAPI loopback. The recording
  controls and webcam bubble are excluded from captures, and the webcam is
  composited into the video instead. Microphone and camera access follow
  **Settings → Privacy & security**; Screenly links there when access is off.
  Sign-in tokens are encrypted with DPAPI.
- **Linux (X11).** System audio is recorded from the default output's monitor
  through PulseAudio or PipeWire (`pipewire-pulse`). X11 cannot hide windows
  from capture, so full-screen and area recordings include the on-screen
  webcam bubble and controls; window recordings composite the webcam instead.
  Tokens are encrypted with GNOME Keyring or KWallet when available. Without a
  keyring they are stored in an owner-only file and Settings shows a warning.
- **Linux (Wayland).** Screen and window selection goes through the desktop's
  screen-sharing portal (PipeWire) and the global shortcut through the
  GlobalShortcuts portal where the compositor supports it. Area capture is not
  available on Wayland.

The `Release desktop recorder` workflow (`.github/workflows/desktop-release.yml`)
builds the Windows installer on `windows-latest` and the AppImage and `.deb` on
`ubuntu-22.04` for every pull request that changes the recorder, and uploads
them as workflow artifacts. On a `main` push it publishes the version in
`apps/desktop/package.json`; a manual dispatch publishes a chosen version, and
`desktop-internal-v*` tags build without publishing. Published objects sit
next to the DMG with `version` and `sha256` metadata:

```text
releases/Screenly-Setup-<version>.exe      releases/Screenly-Setup-latest.exe
releases/Screenly-<version>-x86_64.AppImage releases/Screenly-latest-x86_64.AppImage
releases/screenly_<version>_amd64.deb      releases/screenly-latest-amd64.deb
```

The workflow reuses the macOS release storage secrets and variables unless
`DESKTOP_RELEASE_STORAGE_ACCESS_KEY_ID`, `DESKTOP_RELEASE_STORAGE_SECRET_ACCESS_KEY`,
`DESKTOP_RELEASE_STORAGE_URI`, `DESKTOP_RELEASE_STORAGE_REGION`, or
`DESKTOP_RELEASE_STORAGE_ENDPOINT` override them. Set
`WINDOWS_CERTIFICATE_P12_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD` to sign the
installer; unsigned installers still publish, and SmartScreen asks users to
confirm them with **More info → Run anyway**.

`/download` features the visitor's operating system and lists every published
build with its checksum. `/api/releases/<platform>/latest` and
`/api/releases/<platform>/download` serve `macos`, `windows`, `linux-appimage`,
and `linux-deb`. Windows and Linux releases need no web configuration once
published; `WINDOWS_APP_*`, `LINUX_APPIMAGE_*`, and `LINUX_DEB_*` accept the same
`DOWNLOAD_URL`, `VERSION`, and `SHA256` overrides as `MAC_APP_*`.

## Current verification commands

```bash
pnpm audit --prod --audit-level high
pnpm test
pnpm lint
pnpm typecheck
pnpm build
docker compose config
docker build -f apps/web/Dockerfile .
docker build -f apps/worker/Dockerfile .
# On macOS:
xcodebuild -project apps/mac/Screenly.xcodeproj -scheme Screenly build
# On Windows or Linux:
pnpm --filter @screenly/desktop package:windows   # or package:linux
```

`pnpm test` covers the pure helpers (`env`, `rate-limit`, `search`, `format`,
`format-processing`, `processing`, `release`, `platform`, `slack`,
`gcp-auth`), the worker's config, loop, progress and media modules, and the
desktop recorder's upload, sign-in, settings, and capture-geometry modules.
Two development-only transitive advisories without a published fix (`braces`
under `eslint-config-next`, `sprintf-js` under `electron-builder`) remain in
the full `pnpm audit`; neither package ships in a production image or bundle. UI behaviour is verified against a running instance: point a browser at
a seeded local database and check the viewer, library, settings and auth flows,
including playback, keyboard shortcuts, hover previews, live processing updates,
and both themes at desktop and mobile widths.

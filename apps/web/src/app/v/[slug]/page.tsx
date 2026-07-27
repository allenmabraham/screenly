import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ProcessingState } from "@/components/video/processing-state";
import { PLAYER_SHORTCUTS } from "@/components/video/player-shortcuts";
import { VideoPlayer } from "@/components/video/video-player";
import { ViewTracker } from "@/components/view-tracker";
import { Avatar } from "@/components/ui/avatar";
import { CopyButton } from "@/components/ui/copy-button";
import { AlertTriangleIcon, ClockIcon, EyeIcon } from "@/components/ui/icons";
import { ToastProvider } from "@/components/ui/toast";
import { getPublicVideoBySlug } from "@/features/videos/video-service";
import { formatCount, formatDate, formatDuration } from "@/lib/format";
import { getCookieSessionAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

const getVideo = cache(getPublicVideoBySlug);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const video = await getVideo(slug);

  if (!video) {
    return { title: "Video not found" };
  }

  const description = `Watch a recording shared by ${video.recorderName}.`;
  const canonicalUrl = absoluteAppUrl(`/v/${encodeURIComponent(video.slug)}`);
  const metadataThumbnailUrl =
    absoluteAppUrl(`/api/videos/${encodeURIComponent(video.slug)}/thumbnail`) ??
    video.thumbnailUrl;
  const metadataPlaybackUrl =
    absoluteAppUrl(`/api/videos/${encodeURIComponent(video.slug)}/playback`) ??
    video.playbackUrl;

  return {
    title: video.title,
    description,
    alternates: canonicalUrl ? { canonical: canonicalUrl } : undefined,
    openGraph: {
      type: "website",
      title: video.title,
      description,
      siteName: "Screenly",
      url: canonicalUrl ?? undefined,
      images: metadataThumbnailUrl
        ? [
            {
              url: metadataThumbnailUrl,
              type: "image/jpeg",
              alt: `Preview of ${video.title}`,
            },
          ]
        : undefined,
      videos:
        video.status === "ready" && metadataPlaybackUrl
          ? [
              {
                url: metadataPlaybackUrl,
                type: "video/mp4",
              },
            ]
          : undefined,
    },
    twitter: metadataThumbnailUrl
      ? {
          card: "summary_large_image",
          title: video.title,
          description,
          images: [metadataThumbnailUrl],
        }
      : undefined,
  };
}

export default async function VideoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [video, authentication] = await Promise.all([
    getVideo(slug),
    getCookieSessionAuth(),
  ]);

  if (!video) {
    notFound();
  }

  const isReady = video.status === "ready" && video.playbackUrl;
  const embedUrl = absoluteAppUrl(`/embed/v/${encodeURIComponent(video.slug)}`);

  return (
    <ToastProvider>
      <SiteHeader isSignedIn={Boolean(authentication)} />

      <main className="shell shell--wide viewer" id="main">
        <div className={`viewer__stage${isReady ? "" : " viewer__stage--state"}`}>
          {isReady ? (
            <VideoPlayer
              durationSeconds={video.durationSeconds}
              posterUrl={video.thumbnailUrl}
              slug={video.slug}
              title={video.title}
              videoUrl={video.playbackUrl!}
            />
          ) : video.status === "uploading" || video.status === "processing" ? (
            <ProcessingState
              initialProcessing={video.processing}
              slug={video.slug}
              status={video.status}
            />
          ) : (
            <div className="viewer__failed">
              <span className="viewer__failed-icon">
                <AlertTriangleIcon size={22} />
              </span>
              <div>
                <p className="viewer__failed-title">Processing failed</p>
                <p className="viewer__failed-body">
                  Something went wrong while preparing this recording. The person
                  who recorded it can retry processing from their library.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="viewer__details">
          <div className="viewer__headline">
            <h1 className="viewer__title">{video.title}</h1>
            <div className="viewer__meta">
              <span className="viewer__author">
                <Avatar name={video.recorderName} size="sm" />
                {video.recorderName}
              </span>
              <span aria-hidden="true" className="viewer__meta-dot" />
              <time dateTime={video.createdAt}>
                {formatDate(video.createdAt)}
              </time>
              {video.durationSeconds ? (
                <>
                  <span aria-hidden="true" className="viewer__meta-dot" />
                  <span className="viewer__meta-item tabular">
                    <ClockIcon size={14} />
                    {formatDuration(video.durationSeconds)}
                  </span>
                </>
              ) : null}
              <span aria-hidden="true" className="viewer__meta-dot" />
              <span className="viewer__meta-item tabular">
                <EyeIcon size={15} />
                {formatCount(video.viewCount, "view")}
              </span>
            </div>
          </div>

          <div className="viewer__actions">
            <CopyButton
              label="Copy link"
              toastMessage="Share link copied to your clipboard."
            />
            {isReady && embedUrl ? (
              <CopyButton
                icon="copy"
                label="Copy embed"
                toastMessage="Embed code copied to your clipboard."
                value={`<iframe src="${embedUrl}" width="640" height="360" frameborder="0" allow="fullscreen; picture-in-picture" allowfullscreen title="${video.title.replace(/"/g, "&quot;")}"></iframe>`}
                variant="ghost"
              />
            ) : null}
            <Link
              className="btn btn--ghost"
              href={authentication ? "/library" : "/login"}
            >
              {authentication ? "Open library" : "Sign in"}
            </Link>
          </div>
        </div>

        {isReady ? (
          <details className="viewer__shortcuts">
            <summary>Keyboard shortcuts</summary>
            <dl>
              {PLAYER_SHORTCUTS.map(([keys, description]) => (
                <div key={keys}>
                  <dt>
                    <kbd>{keys}</kbd>
                  </dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </main>

      <SiteFooter />
      {video.status === "ready" ? <ViewTracker slug={video.slug} /> : null}
    </ToastProvider>
  );
}

function absoluteAppUrl(pathname: string) {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    return null;
  }

  try {
    return new URL(pathname, appUrl).toString();
  } catch {
    return null;
  }
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";

import { VideoViewers } from "@/components/library/video-viewers";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { VideoStatusBadge } from "@/components/ui/badge";
import {
  FilmIcon,
  LinkIcon,
  MoreIcon,
  PencilIcon,
  PlayIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { formatDuration, formatRelativeTime } from "@/lib/format";

export type LibraryVideo = {
  id: string;
  slug: string;
  title: string;
  recorderName: string;
  ownerUserId: string | null;
  status: "uploading" | "processing" | "ready" | "failed";
  thumbnailUrl: string | null;
  hasPreview: boolean;
  durationSeconds: number | null;
  viewCount: number;
  createdAt: string;
};

/**
 * Hover previews are a nice-to-have, so they are skipped when the viewer has
 * asked for reduced motion, is on a metered connection, or is using a touch
 * device where there is no hover intent to speak of.
 */
function shouldLoadPreview() {
  if (typeof window === "undefined") {
    return false;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  if (!window.matchMedia("(hover: hover)").matches) {
    return false;
  }
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  return !connection?.saveData;
}

export function VideoCard({
  video,
  currentUserId,
  priority = false,
}: {
  video: LibraryVideo;
  currentUserId?: string;
  /** First row of the grid: load eagerly so it can be the LCP element. */
  priority?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [title, setTitle] = useState(video.title);
  const [displayTitle, setDisplayTitle] = useState(video.title);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function loadPreview() {
    if (!video.hasPreview || video.status !== "ready") {
      return;
    }
    if (!previewUrl) {
      if (!shouldLoadPreview()) {
        return;
      }
      setPreviewUrl(`/api/library/videos/${video.id}/preview`);
    }
    setIsPreviewVisible(true);
  }

  async function saveTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === displayTitle) {
      setIsEditing(false);
      return;
    }

    // Optimistic: show the new title immediately, roll back if the API refuses.
    const previousTitle = displayTitle;
    setDisplayTitle(nextTitle);
    setIsEditing(false);

    const response = await fetch(`/api/library/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle }),
    });

    if (!response.ok) {
      setDisplayTitle(previousTitle);
      setTitle(previousTitle);
      toast("Could not rename this recording.", "error");
      return;
    }

    toast("Recording renamed.", "success");
    startTransition(() => router.refresh());
  }

  async function removeVideo() {
    setIsConfirmingDelete(false);
    setIsDeleted(true);

    const response = await fetch(`/api/library/videos/${video.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setIsDeleted(false);
      toast("Could not delete this recording.", "error");
      return;
    }

    toast("Recording deleted.", "success");
    startTransition(() => router.refresh());
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        new URL(`/v/${video.slug}`, window.location.origin).toString(),
      );
      toast("Share link copied to your clipboard.", "success");
    } catch {
      toast("Copying is blocked by the browser.", "error");
    }
  }

  if (isDeleted) {
    return null;
  }

  const isMine = Boolean(currentUserId) && video.ownerUserId === currentUserId;
  const href = `/v/${video.slug}`;

  return (
    <article className={`vcard${isPending ? " is-pending" : ""}`}>
      <Link
        aria-label={`Watch ${displayTitle}`}
        className="vcard__preview"
        href={href}
        onBlur={() => setIsPreviewVisible(false)}
        onFocus={loadPreview}
        onPointerEnter={loadPreview}
        onPointerLeave={() => setIsPreviewVisible(false)}
      >
        {video.thumbnailUrl ? (
          // A signed, hourly-rotating URL: next/image would re-optimise it on
          // every rotation for no benefit, so a lazy native <img> is correct.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="vcard__image"
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            height={270}
            loading={priority ? "eager" : "lazy"}
            src={video.thumbnailUrl}
            width={480}
          />
        ) : (
          <span className="vcard__placeholder">
            <FilmIcon size={26} />
          </span>
        )}

        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            aria-hidden="true"
            className={`vcard__animated${isPreviewVisible ? " is-visible" : ""}`}
            decoding="async"
            src={previewUrl}
          />
        ) : null}

        <span className="vcard__scrim" />

        {video.status === "ready" ? (
          <span className="vcard__play">
            <PlayIcon size={16} />
          </span>
        ) : (
          <span className="vcard__status">
            <VideoStatusBadge onMedia status={video.status} />
          </span>
        )}

        {video.durationSeconds ? (
          <span className="vcard__duration chip chip--media">
            {formatDuration(video.durationSeconds)}
          </span>
        ) : null}
      </Link>

      <div className="vcard__body">
        {isEditing ? (
          <form className="vcard__rename" onSubmit={saveTitle}>
            <label className="sr-only" htmlFor={`rename-${video.id}`}>
              Recording title
            </label>
            <input
              autoFocus
              className="input"
              id={`rename-${video.id}`}
              maxLength={240}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setTitle(displayTitle);
                  setIsEditing(false);
                }
              }}
              ref={inputRef}
              required
              value={title}
            />
            <div className="vcard__rename-actions">
              <Button size="sm" type="submit" variant="primary">
                Save
              </Button>
              <Button
                onClick={() => {
                  setTitle(displayTitle);
                  setIsEditing(false);
                }}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <Link className="vcard__title" href={href}>
              {displayTitle}
            </Link>
            <p className="vcard__meta">
              <Avatar name={video.recorderName} size="sm" />
              <span className="vcard__author">
                {isMine ? "You" : video.recorderName}
              </span>
              <span aria-hidden="true">·</span>
              <time dateTime={video.createdAt}>
                {formatRelativeTime(video.createdAt)}
              </time>
            </p>
          </>
        )}

        {isConfirmingDelete ? (
          <div className="vcard__confirm" role="alertdialog">
            <span>Delete permanently?</span>
            <Button onClick={removeVideo} size="sm" variant="danger">
              Delete
            </Button>
            <Button
              autoFocus
              onClick={() => setIsConfirmingDelete(false)}
              size="sm"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="vcard__actions">
            <VideoViewers videoId={video.id} viewCount={video.viewCount} />
            <Menu
              align="end"
              label={<MoreIcon size={16} />}
              side="above"
              triggerClassName="btn btn--ghost btn--sm btn--icon"
              triggerLabel={`Actions for ${displayTitle}`}
            >
              {(close) => (
                <>
                  <button
                    className="menu__item"
                    onClick={() => {
                      void copyLink();
                      close();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <LinkIcon size={16} />
                    Copy link
                  </button>
                  <button
                    className="menu__item"
                    onClick={() => {
                      setIsEditing(true);
                      close();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <PencilIcon size={16} />
                    Rename
                  </button>
                  <div className="menu__separator" />
                  <button
                    className="menu__item menu__item--danger"
                    onClick={() => {
                      setIsConfirmingDelete(true);
                      close();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <TrashIcon size={16} />
                    Delete
                  </button>
                </>
              )}
            </Menu>
          </div>
        )}
      </div>
    </article>
  );
}

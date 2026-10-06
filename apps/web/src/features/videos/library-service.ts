import { and, asc, desc, eq, ilike } from "drizzle-orm";

import { getDb } from "@/db";
import { videos, videoViews } from "@/db/schema";
import { escapeLikePattern } from "@/lib/search";
import {
  abortMultipartUpload,
  deleteObjectPrefix,
  deleteObjects,
  getPlaybackUrl,
} from "@/lib/storage";

const LIBRARY_PAGE_SIZE = 50;

export const LIBRARY_SORTS = ["newest", "oldest", "views"] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export function isLibrarySort(value: unknown): value is LibrarySort {
  return LIBRARY_SORTS.includes(value as LibrarySort);
}

export async function listLibraryVideos(
  workspaceId: string,
  query?: string,
  ownerUserId?: string,
  sort: LibrarySort = "newest",
) {
  const normalizedQuery = query?.trim();
  const orderBy =
    sort === "oldest"
      ? asc(videos.createdAt)
      : sort === "views"
        ? desc(videos.viewCount)
        : desc(videos.createdAt);

  const rows = await getDb()
    .select({
      id: videos.id,
      slug: videos.slug,
      title: videos.title,
      recorderName: videos.recorderName,
      ownerUserId: videos.ownerUserId,
      status: videos.status,
      thumbnailObjectKey: videos.thumbnailObjectKey,
      previewObjectKey: videos.previewObjectKey,
      durationSeconds: videos.durationSeconds,
      viewCount: videos.viewCount,
      createdAt: videos.createdAt,
    })
    .from(videos)
    .where(
      and(
        eq(videos.workspaceId, workspaceId),
        ownerUserId ? eq(videos.ownerUserId, ownerUserId) : undefined,
        normalizedQuery
          ? ilike(videos.title, `%${escapeLikePattern(normalizedQuery)}%`)
          : undefined,
      ),
    )
    .orderBy(orderBy)
    .limit(LIBRARY_PAGE_SIZE);

  return Promise.all(
    rows.map(async (video) => ({
      ...video,
      createdAt: video.createdAt.toISOString(),
      thumbnailUrl: video.thumbnailObjectKey
        ? await getPlaybackUrl(video.thumbnailObjectKey)
        : null,
      // Only a flag: the animated preview URL is fetched lazily on hover so 50
      // extra signed URLs never ship inside the library HTML.
      hasPreview: Boolean(video.previewObjectKey),
      thumbnailObjectKey: undefined,
      previewObjectKey: undefined,
    })),
  );
}

/** Signed URL for the worker-generated animated preview, or null. */
export async function getVideoPreviewUrl(
  workspaceId: string,
  videoId: string,
) {
  const [video] = await getDb()
    .select({ previewObjectKey: videos.previewObjectKey })
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.workspaceId, workspaceId)))
    .limit(1);

  if (!video?.previewObjectKey) {
    return null;
  }

  return getPlaybackUrl(video.previewObjectKey);
}

export async function listVideoViewers(workspaceId: string, videoId: string) {
  const [video] = await getDb()
    .select({ id: videos.id, viewCount: videos.viewCount })
    .from(videos)
    .where(
      and(eq(videos.id, videoId), eq(videos.workspaceId, workspaceId)),
    )
    .limit(1);

  if (!video) {
    return null;
  }

  const viewers = await getDb()
    .select({
      viewerName: videoViews.viewerName,
      watchCount: videoViews.watchCount,
      lastViewedAt: videoViews.lastViewedAt,
    })
    .from(videoViews)
    .where(eq(videoViews.videoId, video.id))
    .orderBy(desc(videoViews.lastViewedAt));

  return {
    viewCount: video.viewCount,
    viewers: viewers.map((viewer) => ({
      ...viewer,
      lastViewedAt: viewer.lastViewedAt.toISOString(),
    })),
  };
}

export async function renameVideo(
  workspaceId: string,
  videoId: string,
  title: string,
) {
  const [video] = await getDb()
    .update(videos)
    .set({
      title,
      updatedAt: new Date(),
    })
    .where(
      and(eq(videos.id, videoId), eq(videos.workspaceId, workspaceId)),
    )
    .returning({
      id: videos.id,
      title: videos.title,
    });

  return video ?? null;
}

export async function deleteVideo(workspaceId: string, videoId: string) {
  const [video] = await getDb()
    .select()
    .from(videos)
    .where(
      and(eq(videos.id, videoId), eq(videos.workspaceId, workspaceId)),
    )
    .limit(1);

  if (!video) {
    return false;
  }

  await Promise.all([
    // An interrupted recorder leaves a multipart upload open; aborting it
    // frees the parts that `DeleteObjects` on the final key would not touch.
    video.multipartUploadId
      ? abortMultipartUpload({
          key: video.sourceObjectKey,
          uploadId: video.multipartUploadId,
        }).catch((error) => {
          if (!isMissingUploadError(error)) {
            throw error;
          }
        })
      : Promise.resolve(),
    deleteObjects([video.sourceObjectKey]),
    deleteObjectPrefix(`processed/${video.id}/`),
  ]);
  await getDb()
    .delete(videos)
    .where(
      and(eq(videos.id, video.id), eq(videos.workspaceId, workspaceId)),
    );
  return true;
}

function isMissingUploadError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "NoSuchUpload" || error.name === "NotFound")
  );
}

import { z } from "zod";

import { getVideoPreviewUrl } from "@/features/videos/library-service";
import { apiErrorResponse } from "@/lib/api";
import { getRequestAuth, workspaceUnauthorizedResponse } from "@/lib/session";

export const runtime = "nodejs";

const videoIdSchema = z.uuid();

/**
 * Redirects to the animated preview the processor already generates
 * (`preview.webp`). Library cards point an <img> at this route on hover, so the
 * grid HTML never carries 50 extra signed URLs and no signing work happens
 * unless a card is actually hovered.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const authentication = await getRequestAuth(request);
  if (!authentication) {
    return workspaceUnauthorizedResponse();
  }

  try {
    const { videoId: rawVideoId } = await params;
    const videoId = videoIdSchema.parse(rawVideoId);
    const previewUrl = await getVideoPreviewUrl(
      authentication.workspace.id,
      videoId,
    );

    if (!previewUrl) {
      return new Response(null, { status: 404 });
    }

    return new Response(null, {
      status: 307,
      headers: {
        "Cache-Control": "private, max-age=300",
        Location: previewUrl,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

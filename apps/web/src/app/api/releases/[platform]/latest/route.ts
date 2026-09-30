import { getRelease, isReleasePlatform } from "@/lib/release";
import {
  releaseUnavailableResponse,
  unknownPlatformResponse,
} from "@/lib/release-responses";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  if (!isReleasePlatform(platform)) {
    return unknownPlatformResponse();
  }

  const release = await getRelease(platform);
  if (!release) {
    return releaseUnavailableResponse(platform);
  }

  return Response.json(release, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}

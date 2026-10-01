import {
  getRelease,
  getReleaseFileName,
  getReleaseObjectKey,
  isReleasePlatform,
} from "@/lib/release";
import {
  releaseUnavailableResponse,
  unknownPlatformResponse,
} from "@/lib/release-responses";
import { getDownloadUrl } from "@/lib/storage";

export const runtime = "nodejs";
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

  const signedURL = await getDownloadUrl(
    getReleaseObjectKey(platform),
    getReleaseFileName(platform, release.version),
  );

  return Response.redirect(signedURL, 307);
}

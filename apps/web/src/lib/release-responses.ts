import { RELEASE_PLATFORMS, type ReleasePlatform } from "./release";

export function unknownPlatformResponse() {
  return Response.json(
    {
      error: {
        code: "unknown_platform",
        message: `Releases are available for ${RELEASE_PLATFORMS.join(", ")}.`,
      },
    },
    { status: 404 },
  );
}

export function releaseUnavailableResponse(platform: ReleasePlatform) {
  return Response.json(
    {
      error: {
        code: "release_unavailable",
        message: `No ${platform} release is currently published.`,
      },
    },
    { status: 404 },
  );
}

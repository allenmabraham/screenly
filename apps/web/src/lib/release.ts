export const RELEASE_PLATFORMS = [
  "macos",
  "windows",
  "linux-appimage",
  "linux-deb",
] as const;

export type ReleasePlatform = (typeof RELEASE_PLATFORMS)[number];

type ReleaseArtifact = {
  objectKey: string;
  environmentPrefix: string;
  format: "dmg" | "exe" | "AppImage" | "deb";
  architecture: string;
  minimumSystemVersion: string | null;
  fileName: (version: string) => string;
};

/**
 * Published by the release workflows. Each "latest" object carries `version`
 * and `sha256` metadata so the web app never needs a redeploy for a release.
 */
const RELEASE_ARTIFACTS: Record<ReleasePlatform, ReleaseArtifact> = {
  macos: {
    objectKey: "releases/Screenly-latest.dmg",
    environmentPrefix: "MAC_APP",
    format: "dmg",
    architecture: "universal",
    minimumSystemVersion: "15.0",
    fileName: (version) => `Screenly-${version}.dmg`,
  },
  windows: {
    objectKey: "releases/Screenly-Setup-latest.exe",
    environmentPrefix: "WINDOWS_APP",
    format: "exe",
    architecture: "x64",
    minimumSystemVersion: "10",
    fileName: (version) => `Screenly-Setup-${version}.exe`,
  },
  "linux-appimage": {
    objectKey: "releases/Screenly-latest-x86_64.AppImage",
    environmentPrefix: "LINUX_APPIMAGE",
    format: "AppImage",
    architecture: "x64",
    minimumSystemVersion: null,
    fileName: (version) => `Screenly-${version}-x86_64.AppImage`,
  },
  "linux-deb": {
    objectKey: "releases/screenly-latest-amd64.deb",
    environmentPrefix: "LINUX_DEB",
    format: "deb",
    architecture: "x64",
    minimumSystemVersion: null,
    fileName: (version) => `screenly_${version}_amd64.deb`,
  },
};

export type Release = NonNullable<ReturnType<typeof resolveRelease>>;

export function isReleasePlatform(value: string): value is ReleasePlatform {
  return (RELEASE_PLATFORMS as readonly string[]).includes(value);
}

export async function getRelease(platform: ReleasePlatform) {
  const artifact = RELEASE_ARTIFACTS[platform];
  let publishedMetadata: Record<string, string> = {};
  try {
    const { getObjectMetadata } = await import("./storage");
    publishedMetadata = await getObjectMetadata(artifact.objectKey);
  } catch {
    // Keep the configured release available during transient storage failures.
  }

  const environment = (suffix: string) =>
    process.env[`${artifact.environmentPrefix}_${suffix}`];
  return resolveRelease(platform, {
    downloadURL: environment("DOWNLOAD_URL"),
    configuredVersion: environment("VERSION"),
    configuredSHA256: environment("SHA256"),
    publishedMetadata,
    appURL: process.env.APP_URL,
  });
}

export async function getReleases() {
  const releases = await Promise.all(
    RELEASE_PLATFORMS.map(async (platform) => [platform, await getRelease(platform)] as const),
  );
  return Object.fromEntries(releases) as Record<ReleasePlatform, Release | null>;
}

export function resolveRelease(
  platform: ReleasePlatform,
  input: {
    downloadURL?: string;
    configuredVersion?: string;
    configuredSHA256?: string;
    publishedMetadata?: Record<string, string>;
    appURL?: string;
  },
) {
  const artifact = RELEASE_ARTIFACTS[platform];
  const publishedVersion = validVersion(input.publishedMetadata?.version);
  const version = publishedVersion ?? (input.configuredVersion?.trim() || null);
  if (!version) {
    return null;
  }

  let downloadURL: string;
  if (input.downloadURL) {
    try {
      downloadURL = new URL(input.downloadURL).toString();
    } catch {
      throw new Error(
        `${artifact.environmentPrefix}_DOWNLOAD_URL must be a valid absolute URL.`,
      );
    }
  } else if (publishedVersion) {
    downloadURL = releaseDownloadPath(platform, input.appURL);
  } else {
    return null;
  }

  return {
    platform,
    version,
    downloadURL,
    sha256: input.publishedMetadata?.sha256 ?? input.configuredSHA256 ?? null,
    minimumSystemVersion: artifact.minimumSystemVersion,
    format: artifact.format,
    architecture: artifact.architecture,
  };
}

export function getReleaseObjectKey(platform: ReleasePlatform) {
  return RELEASE_ARTIFACTS[platform].objectKey;
}

export function getReleaseFileName(platform: ReleasePlatform, version: string) {
  return RELEASE_ARTIFACTS[platform].fileName(version);
}

function releaseDownloadPath(platform: ReleasePlatform, appURL: string | undefined) {
  const path = `/api/releases/${platform}/download`;
  if (!appURL) {
    return path;
  }
  try {
    return new URL(path, appURL).toString();
  } catch {
    return path;
  }
}

function validVersion(value: string | undefined) {
  const version = value?.trim();
  return version && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)
    ? version
    : null;
}

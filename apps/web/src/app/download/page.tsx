import type { Metadata } from "next";
import { headers } from "next/headers";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { buttonClassName } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  BoltIcon,
  ChatIcon,
  DownloadIcon,
  FilmIcon,
  MonitorIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { LogoMark } from "@/components/ui/logo";
import { ToastProvider } from "@/components/ui/toast";
import { type DesktopPlatform, detectDesktopPlatform } from "@/lib/platform";
import { type Release, type ReleasePlatform, getReleases } from "@/lib/release";
import { getCookieSessionAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Screenly recorders for macOS, Windows and Linux: capture your screen, microphone, system audio and webcam, and share a link before the upload finishes.",
};

const FEATURES = [
  {
    Icon: BoltIcon,
    title: "Share link before the upload",
    body: "The link is on your clipboard the moment you stop recording.",
  },
  {
    Icon: FilmIcon,
    title: "Screen, window or region",
    body: "Capture any display, a single window, or drag out an area.",
  },
  {
    Icon: ChatIcon,
    title: "Slack-native playback",
    body: "Pasted links unfurl into an inline player and update when ready.",
  },
  {
    Icon: UsersIcon,
    title: "Attributed to you",
    body: "Sign in once and every recording lands in your team library.",
  },
];

type PlatformInfo = {
  name: string;
  requirements: string;
  packages: { platform: ReleasePlatform; label: string }[];
  steps: string[];
};

const PLATFORMS: Record<DesktopPlatform, PlatformInfo> = {
  macos: {
    name: "macOS",
    requirements: "macOS 15 or later · Apple silicon and Intel",
    packages: [{ platform: "macos", label: "Download .dmg" }],
    steps: [
      "Open the downloaded DMG and drag Screenly to Applications.",
      "Launch it and grant Screen Recording and Microphone access in System Settings.",
      "Sign in with your Screenly account and pick a capture source from the menu bar.",
    ],
  },
  windows: {
    name: "Windows",
    requirements: "Windows 10 or later · 64-bit",
    packages: [{ platform: "windows", label: "Download installer" }],
    steps: [
      "Run the downloaded installer. Screenly installs for your account and opens automatically.",
      "Sign in with your Screenly account in the welcome window.",
      "Start a recording from the system tray icon or with Alt+Shift+R.",
    ],
  },
  linux: {
    name: "Linux",
    requirements: "64-bit x86 · X11 or Wayland with PipeWire",
    packages: [
      { platform: "linux-appimage", label: "AppImage" },
      { platform: "linux-deb", label: ".deb package" },
    ],
    steps: [
      "Install the .deb with your package manager, or mark the AppImage as executable and run it.",
      "Sign in with your Screenly account in the welcome window.",
      "Start a recording from the tray icon or with Alt+Shift+R. On Wayland, your desktop asks which screen or window to share.",
    ],
  },
};

const PLATFORM_ORDER: DesktopPlatform[] = ["macos", "windows", "linux"];

export default async function DownloadPage() {
  const [releases, authentication, requestHeaders] = await Promise.all([
    getReleases(),
    getCookieSessionAuth(),
    headers(),
  ]);
  const detected = detectDesktopPlatform(requestHeaders.get("user-agent"));
  const featured = detected ?? "macos";
  const featuredInfo = PLATFORMS[featured];
  const featuredRelease = releases[featuredInfo.packages[0]!.platform];
  const orderedPlatforms = [
    featured,
    ...PLATFORM_ORDER.filter((platform) => platform !== featured),
  ];

  return (
    <ToastProvider>
      <SiteHeader isSignedIn={Boolean(authentication)} showNav />

      <main className="shell page-shell download" id="main">
        <section className="download__hero">
          <span className="download__icon">
            <LogoMark size={52} />
          </span>
          <p className="eyebrow">macOS · Windows · Linux</p>
          <h1 className="download__title">Record at the speed of thought.</h1>
          <p className="download__lede">
            Capture your screen, microphone, system audio and webcam with a
            lightweight recorder that lives in your menu bar or system tray.
          </p>

          {featuredRelease ? (
            <div className="download__cta">
              <a
                className={buttonClassName({ size: "lg", variant: "primary" })}
                download
                href={featuredRelease.downloadURL}
              >
                <DownloadIcon size={18} />
                Download for {featuredInfo.name}
              </a>
              <span className="download__meta tabular">
                Version {featuredRelease.version} · {featuredInfo.requirements}
              </span>
              <a className="download__other" href="#platforms">
                Other platforms
              </a>
            </div>
          ) : (
            <div className="alert alert--warning download__unavailable">
              <ShieldIcon className="alert__icon" size={18} />
              <div>
                <p className="alert__title">
                  No {featuredInfo.name} release published yet
                </p>
                <p className="alert__body">
                  Ask an admin to run the release workflow, then reload this
                  page. Builds for other platforms are listed below.
                </p>
              </div>
            </div>
          )}
        </section>

        <section
          aria-labelledby="platforms-title"
          className="download__platforms"
          id="platforms"
        >
          <h2 className="sr-only" id="platforms-title">
            All platforms
          </h2>
          {orderedPlatforms.map((platform) => (
            <PlatformCard
              info={PLATFORMS[platform]}
              key={platform}
              releases={releases}
            />
          ))}
        </section>

        <section aria-label="Features" className="download__features">
          {FEATURES.map(({ Icon, title, body }) => (
            <div className="download__feature" key={title}>
              <span className="download__feature-icon">
                <Icon size={17} />
              </span>
              <h2>{title}</h2>
              <p>{body}</p>
            </div>
          ))}
        </section>

        <section className="download__install">
          <h2 className="download__install-title">Installing</h2>
          <div className="download__install-grid">
            {orderedPlatforms.map((platform) => {
              const info = PLATFORMS[platform];
              return (
                <div key={platform}>
                  <h3 className="download__install-platform">{info.name}</h3>
                  <ol className="download__steps">
                    {info.steps.map((step, index) => (
                      <li key={step}>
                        <span className="download__step-number tabular">
                          {index + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
          <p className="download__note">
            Internal macOS builds are ad-hoc signed, so Gatekeeper asks for
            confirmation the first time: Control-click the app and choose
            <strong> Open</strong>. Unsigned Windows builds show a SmartScreen
            prompt; choose <strong>More info → Run anyway</strong>. Signed and
            notarized releases open normally.
          </p>
        </section>
      </main>

      <SiteFooter />
    </ToastProvider>
  );
}

function PlatformCard({
  info,
  releases,
}: {
  info: PlatformInfo;
  releases: Record<ReleasePlatform, Release | null>;
}) {
  const published = info.packages
    .map((item) => ({ ...item, release: releases[item.platform] }))
    .filter(
      (item): item is typeof item & { release: Release } => item.release !== null,
    );
  const version = published[0]?.release.version;

  return (
    <article className="download__platform">
      <header className="download__platform-header">
        <span className="download__feature-icon">
          <MonitorIcon size={17} />
        </span>
        <div>
          <h3>{info.name}</h3>
          <p className="download__meta">{info.requirements}</p>
        </div>
      </header>

      {published.length > 0 ? (
        <>
          <div className="download__platform-actions">
            {published.map(({ platform, label, release }) => (
              <a
                className={buttonClassName({ size: "sm", variant: "secondary" })}
                download
                href={release.downloadURL}
                key={platform}
              >
                <DownloadIcon size={15} />
                {label}
              </a>
            ))}
          </div>
          <p className="download__meta tabular">Version {version}</p>
          {published
            .filter(({ release }) => release.sha256)
            .map(({ platform, label, release }) => (
              <div className="download__checksum download__checksum--compact" key={platform}>
                <span className="download__checksum-label">
                  {published.length > 1 ? `${label} SHA-256` : "SHA-256"}
                </span>
                <code className="mono" title={release.sha256 ?? undefined}>
                  {release.sha256}
                </code>
                <CopyButton
                  icon="copy"
                  label="Copy"
                  size="sm"
                  toastMessage="Checksum copied to your clipboard."
                  value={release.sha256 ?? ""}
                  variant="ghost"
                />
              </div>
            ))}
        </>
      ) : (
        <p className="download__platform-empty">Not published yet.</p>
      )}
    </article>
  );
}

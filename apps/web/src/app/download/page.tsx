import type { Metadata } from "next";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ButtonLink } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  BoltIcon,
  DownloadIcon,
  FilmIcon,
  ShieldIcon,
  ChatIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { LogoMark } from "@/components/ui/logo";
import { ToastProvider } from "@/components/ui/toast";
import { getMacRelease } from "@/lib/release";
import { getCookieSessionAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Download for Mac",
  description:
    "The native macOS recorder for Screenly: capture your screen, microphone, system audio and webcam from the menu bar.",
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

const STEPS = [
  "Open the downloaded DMG and drag Screenly to Applications.",
  "Launch it and grant Screen Recording and Microphone access in System Settings.",
  "Sign in with your Screenly account and pick a capture source from the menu bar.",
];

export default async function DownloadPage() {
  const release = await getMacRelease();
  const authentication = await getCookieSessionAuth();

  return (
    <ToastProvider>
      <SiteHeader isSignedIn={Boolean(authentication)} showNav />

      <main className="shell page-shell download" id="main">
        <section className="download__hero">
          <span className="download__icon">
            <LogoMark size={52} />
          </span>
          <p className="eyebrow">Native macOS recorder</p>
          <h1 className="download__title">Record at the speed of thought.</h1>
          <p className="download__lede">
            Capture your screen, microphone, system audio and webcam with a
            lightweight menu bar app built entirely with Swift and
            ScreenCaptureKit.
          </p>

          {release ? (
            <>
              <div className="download__cta">
                <ButtonLink
                  href={release.downloadURL}
                  size="lg"
                  variant="primary"
                >
                  <DownloadIcon size={18} />
                  Download for Mac
                </ButtonLink>
                <span className="download__meta tabular">
                  Version {release.version} · macOS{" "}
                  {release.minimumSystemVersion}+ · Apple silicon and Intel
                </span>
              </div>

              {release.sha256 ? (
                <div className="download__checksum">
                  <span className="download__checksum-label">SHA-256</span>
                  <code className="mono" title={release.sha256}>
                    {release.sha256}
                  </code>
                  <CopyButton
                    icon="copy"
                    label="Copy"
                    size="sm"
                    toastMessage="Checksum copied to your clipboard."
                    value={release.sha256}
                    variant="ghost"
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div className="alert alert--warning download__unavailable">
              <ShieldIcon className="alert__icon" size={18} />
              <div>
                <p className="alert__title">No signed release published yet</p>
                <p className="alert__body">
                  The first notarized Mac build has not been published. Ask an
                  admin to run the release workflow, then reload this page.
                </p>
              </div>
            </div>
          )}
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
          <ol className="download__steps">
            {STEPS.map((step, index) => (
              <li key={step}>
                <span className="download__step-number tabular">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="download__note">
            Internal test builds are ad-hoc signed, so Gatekeeper asks for
            confirmation the first time: Control-click the app and choose
            <strong> Open</strong>. Notarized releases open normally.
          </p>
        </section>
      </main>

      <SiteFooter />
    </ToastProvider>
  );
}

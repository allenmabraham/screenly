import Link from "next/link";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { AppWindow } from "@/components/marketing/app-window";
import { ButtonLink } from "@/components/ui/button";
import {
  ArrowRightIcon,
  BoltIcon,
  DownloadIcon,
  FilmIcon,
  KeyIcon,
  PlayIcon,
  ChatIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { getCookieSessionAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    number: "01",
    title: "Record",
    body: "Capture a screen, a window, or a dragged-out region from the menu bar or system tray.",
  },
  {
    number: "02",
    title: "Share",
    body: "The link is on your clipboard before the upload finishes. Paste it anywhere.",
  },
  {
    number: "03",
    title: "Move on",
    body: "Viewers watch a live status until processing ends, then playback starts.",
  },
];

const FEATURES = [
  {
    Icon: BoltIcon,
    title: "Links before uploads",
    body: "The share URL is created with the recording, so you never wait on a progress bar to send it.",
  },
  {
    Icon: PlayIcon,
    title: "Live processing status",
    body: "The viewer shows the real stage, percentage and estimated time from the worker — never an invented ETA.",
  },
  {
    Icon: ChatIcon,
    title: "Plays inside Slack",
    body: "Pasted links unfurl into an inline player and update in place when the recording is ready.",
  },
  {
    Icon: UsersIcon,
    title: "See who watched",
    body: "Every recording lists named viewers from your workspace, with watch counts.",
  },
  {
    Icon: KeyIcon,
    title: "Per-device tokens",
    body: "Each computer gets its own recorder token that can be revoked without touching past recordings.",
  },
  {
    Icon: FilmIcon,
    title: "macOS, Windows and Linux",
    body: "Screen, microphone, system audio and webcam from native desktop recorders, mixed for browser playback.",
  },
];

export default async function Home() {
  const authentication = await getCookieSessionAuth();

  return (
    <>
      <SiteHeader isSignedIn={Boolean(authentication)} showNav />

      <main id="main">
        <section className="shell hero">
          <div className="hero__copy">
            <p className="hero__chip">
              <span className="hero__chip-dot" />
              Internal tool · Screen recording for the team
            </p>
            {/*
              Each sentence is its own line on wide viewports and flows
              naturally on narrow ones, so the headline never breaks
              mid-sentence at any width.
            */}
            <h1 className="hero__title">
              <span>Record it.</span> <span>Share it.</span>{" "}
              <span>Keep moving.</span>
            </h1>
            <p className="hero__lede">
              A fast, private screen recorder for your team. The share link is
              ready before the upload finishes, so context never waits on a
              meeting.
            </p>
            <div className="hero__actions">
              <ButtonLink href="/v/demo1234" size="lg" variant="primary">
                Watch the demo
                <ArrowRightIcon size={17} />
              </ButtonLink>
              <ButtonLink href="/download" size="lg" variant="secondary">
                <DownloadIcon size={17} />
                Download the app
              </ButtonLink>
            </div>
            <p className="hero__note">
              macOS, Windows and Linux ·{" "}
              <Link href={authentication ? "/library" : "/login"}>
                {authentication ? "Open your library" : "Sign in"}
              </Link>
            </p>
          </div>

          <div className="hero__visual">
            <AppWindow />
          </div>
        </section>

        <section aria-labelledby="how-it-works" className="shell steps">
          <h2 className="section-title" id="how-it-works">
            Three steps, no meeting
          </h2>
          <ol className="steps__list">
            {STEPS.map(({ number, title, body }) => (
              <li className="steps__item" key={number}>
                <span className="steps__number mono">{number}</span>
                <h3 className="steps__title">{title}</h3>
                <p className="steps__body">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="features" className="shell features">
          <h2 className="section-title" id="features">
            Built for how the team actually shares
          </h2>
          <div className="features__grid">
            {FEATURES.map(({ Icon, title, body }) => (
              <article className="feature" key={title}>
                <span className="feature__icon">
                  <Icon size={17} />
                </span>
                <h3 className="feature__title">{title}</h3>
                <p className="feature__body">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="shell cta">
          <div className="cta__panel">
            <div>
              <h2 className="cta__title">Start recording in a minute</h2>
              <p className="cta__body">
                Install the desktop app, sign in once, and your recordings land
                in the team library automatically.
              </p>
            </div>
            <div className="cta__actions">
              <ButtonLink href="/download" size="lg" variant="primary">
                <DownloadIcon size={17} />
                Download the app
              </ButtonLink>
              <ButtonLink
                href={authentication ? "/library" : "/login"}
                size="lg"
                variant="secondary"
              >
                {authentication ? "Open library" : "Sign in"}
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

import Link from "next/link";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { getCookieSessionAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const authentication = await getCookieSessionAuth();

  return (
    <>
      <SiteHeader isSignedIn={Boolean(authentication)} showNav />

      <main className="shell page-shell" id="main">
        <section className="home-hero">
          <p className="eyebrow">Share context without scheduling a meeting</p>
          <h1>Record it. Share it. Keep moving.</h1>
          <p className="home-subtitle">
            A fast, private screen recorder built for your team. The recording
            link is ready before the upload finishes.
          </p>
          <div className="home-actions">
            <ButtonLink href="/v/demo1234" size="lg" variant="primary">
              Watch demo
              <ArrowRightIcon size={17} />
            </ButtonLink>
            <ButtonLink href="/download" size="lg" variant="secondary">
              Download for Mac
            </ButtonLink>
          </div>
        </section>

        <section className="flow-card" aria-label="Recording workflow">
          {[
            ["01", "Record", "Capture a screen, window, or selected area."],
            ["02", "Upload", "The share link is copied immediately."],
            ["03", "Share", "Paste it into Slack and keep moving."],
          ].map(([number, title, description]) => (
            <div className="flow-step" key={number}>
              <span>{number}</span>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
          ))}
        </section>

        <p className="home-signin-hint">
          Already have an account? <Link href="/login">Sign in</Link> to open
          your team library.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}

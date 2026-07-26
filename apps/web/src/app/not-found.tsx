import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ButtonLink } from "@/components/ui/button";
import { FilmIcon } from "@/components/ui/icons";

export default function NotFound() {
  return (
    <>
      <SiteHeader isSignedIn={false} />

      <main className="shell page-shell status-page" id="main">
        <span className="status-page__icon">
          <FilmIcon size={24} />
        </span>
        <p className="eyebrow">404 · Recording unavailable</p>
        <h1 className="status-page__title">This link has gone quiet.</h1>
        <p className="status-page__body">
          The recording may have been deleted, or the link may be incorrect. Ask
          the person who shared it for a fresh link.
        </p>
        <div className="status-page__actions">
          <ButtonLink href="/" variant="primary">
            Return home
          </ButtonLink>
          <ButtonLink href="/library" variant="secondary">
            Open your library
          </ButtonLink>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

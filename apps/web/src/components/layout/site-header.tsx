import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

type SiteHeaderProps = {
  /** Signed-in visitors get "Open library" instead of "Sign in". */
  isSignedIn: boolean;
  /** Marketing links are hidden on focused pages such as the viewer. */
  showNav?: boolean;
  /** Extra actions rendered before the primary call to action. */
  actions?: React.ReactNode;
};

/**
 * The public header for the marketing, download, viewer and error pages.
 * Server component: the only client JS it pulls in is the theme toggle.
 */
export function SiteHeader({
  isSignedIn,
  showNav = false,
  actions,
}: SiteHeaderProps) {
  return (
    <header className="app-bar">
      <div className="shell app-bar__inner">
        <Logo />

        {showNav ? (
          <nav aria-label="Main" className="app-bar__nav site-nav">
            <Link className="nav-link" href="/v/demo1234">
              Demo
            </Link>
            <Link className="nav-link" href="/download">
              Download
            </Link>
          </nav>
        ) : null}

        <div className="app-bar__spacer" />

        <div className="app-bar__actions">
          {actions}
          <ThemeToggle />
          <ButtonLink
            href={isSignedIn ? "/library" : "/login"}
            size="sm"
            variant={isSignedIn ? "secondary" : "primary"}
          >
            {isSignedIn ? "Open library" : "Sign in"}
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}

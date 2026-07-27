import Link from "next/link";

import { LogoMark } from "@/components/ui/logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <div className="site-footer__brand">
          <LogoMark size={22} />
          <span>Screenly · internal screen recording</span>
        </div>
        <ul className="site-footer__links">
          <li>
            <Link href="/download">Download for Mac</Link>
          </li>
          <li>
            <Link href="/v/demo1234">Watch the demo</Link>
          </li>
          <li>
            <Link href="/login">Sign in</Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}

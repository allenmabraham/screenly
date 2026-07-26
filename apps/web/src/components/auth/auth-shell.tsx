import type { ReactNode } from "react";

import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { BoltIcon, ChatIcon, UsersIcon } from "@/components/ui/icons";

const HIGHLIGHTS = [
  {
    Icon: BoltIcon,
    title: "The link is ready first",
    body: "Paste it in chat while the upload is still running.",
  },
  {
    Icon: ChatIcon,
    title: "Plays inside Slack",
    body: "Shared links unfurl into an inline player, then update when processing finishes.",
  },
  {
    Icon: UsersIcon,
    title: "See who watched",
    body: "Every recording shows named viewers from your workspace.",
  },
];

/**
 * Split layout shared by sign-in and invitation acceptance: the form on the
 * left, a brand panel on the right that collapses away on small screens.
 */
export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="auth" id="main">
      <div className="auth__form-side">
        <div className="auth__topbar">
          <Logo />
          <ThemeToggle />
        </div>

        <div className="auth__card">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="auth__title">{title}</h1>
          {description ? (
            <p className="auth__description">{description}</p>
          ) : null}
          {children}
          {footer ? <div className="auth__footer">{footer}</div> : null}
        </div>

        <div className="auth__spacer" />
      </div>

      <aside className="auth__aside">
        <div className="auth__aside-inner">
          <p className="auth__aside-eyebrow">Screenly</p>
          <p className="auth__aside-headline">
            Record it. Share it. Keep moving.
          </p>
          <ul className="auth__highlights">
            {HIGHLIGHTS.map(({ Icon, title: highlightTitle, body }) => (
              <li key={highlightTitle}>
                <span className="auth__highlight-icon">
                  <Icon size={16} />
                </span>
                <div>
                  <strong>{highlightTitle}</strong>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}

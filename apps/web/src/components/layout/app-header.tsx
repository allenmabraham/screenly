import Link from "next/link";

import {
  WorkspaceMenu,
  type WorkspaceOption,
} from "@/components/layout/workspace-menu";
import { UserMenu } from "@/components/layout/user-menu";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export type AppSection = "library" | "settings";

type AppHeaderProps = {
  user: { username: string; email: string };
  activeWorkspace: WorkspaceOption;
  workspaces: WorkspaceOption[];
  active: AppSection;
  canManage: boolean;
};

/**
 * Header for signed-in screens. The active section is passed in from the page
 * so `aria-current` needs no client-side pathname subscription.
 */
export function AppHeader({
  user,
  activeWorkspace,
  workspaces,
  active,
  canManage,
}: AppHeaderProps) {
  return (
    <header className="app-bar">
      <div className="shell shell--wide app-bar__inner">
        <Logo href="/library" />
        <WorkspaceMenu
          activeWorkspace={activeWorkspace}
          workspaces={workspaces}
        />

        <nav aria-label="Main" className="app-bar__nav">
          <Link
            aria-current={active === "library" ? "page" : undefined}
            className="nav-link"
            href="/library"
          >
            Library
          </Link>
          {canManage ? (
            <Link
              aria-current={active === "settings" ? "page" : undefined}
              className="nav-link"
              href="/library/members"
            >
              Settings
            </Link>
          ) : null}
        </nav>

        <div className="app-bar__spacer" />

        <div className="app-bar__actions">
          <ThemeToggle />
          <UserMenu
            canManage={canManage}
            email={user.email}
            role={activeWorkspace.role}
            username={user.username}
          />
        </div>
      </div>
    </header>
  );
}

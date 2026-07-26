import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { SettingsNav } from "@/components/layout/settings-nav";
import { MemberManager } from "@/components/settings/member-manager";
import { listWorkspaceAccess } from "@/features/auth/invitations";
import { canManageWorkspace, listUserWorkspaces } from "@/features/auth/users";
import { getSessionAuth, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Members",
};

export default async function MembersPage() {
  const cookieStore = await cookies();
  const authentication = await getSessionAuth(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );
  if (!authentication) {
    redirect("/login");
  }
  if (!canManageWorkspace(authentication.workspace.role)) {
    redirect("/library");
  }

  const [access, workspaces] = await Promise.all([
    listWorkspaceAccess(authentication.workspace.id),
    listUserWorkspaces(authentication.user.id),
  ]);

  return (
    <>
      <AppHeader
        active="settings"
        activeWorkspace={authentication.workspace}
        canManage
        user={authentication.user}
        workspaces={workspaces}
      />

      <main className="shell page-shell" id="main">
        <header className="page-head">
          <div>
            <h1 className="page-head__title">Workspace settings</h1>
            <p className="page-head__description">
              Manage who can sign in to {authentication.workspace.name} and
              which Macs may upload recordings.
            </p>
          </div>
        </header>

        <SettingsNav active="members" />

        <div className="settings-stack">
          <MemberManager
            currentRole={authentication.workspace.role}
            invitations={access.invitations}
            members={access.members}
          />
        </div>
      </main>
    </>
  );
}

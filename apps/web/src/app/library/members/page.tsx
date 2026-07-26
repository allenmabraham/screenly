import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { MemberManager } from "@/components/member-manager";
import { listWorkspaceAccess } from "@/features/auth/invitations";
import { canManageWorkspace, listUserWorkspaces } from "@/features/auth/users";
import { getSessionAuth, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";

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
            <p className="eyebrow">{authentication.workspace.name}</p>
            <h1 className="page-head__title">Members</h1>
            <p className="page-head__description">
              Invite teammates and manage outstanding workspace invitations.
            </p>
          </div>
        </header>
        <MemberManager
          currentRole={authentication.workspace.role}
          invitations={access.invitations}
          members={access.members}
        />
      </main>
    </>
  );
}

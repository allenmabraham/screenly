import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { RecorderTokenManager } from "@/components/recorder-token-manager";
import { listRecorderTokens } from "@/features/auth/recorder-tokens";
import { canManageWorkspace, listUserWorkspaces } from "@/features/auth/users";
import { getSessionAuth, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RecorderTokensPage() {
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

  const [tokens, workspaces] = await Promise.all([
    listRecorderTokens(authentication.workspace.id),
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
            <p className="eyebrow">Workspace settings</p>
            <h1 className="page-head__title">Recorder tokens</h1>
            <p className="page-head__description">
              Create a separate token for each Mac. Revoking one immediately
              blocks new uploads without affecting existing recordings.
            </p>
          </div>
        </header>

        <RecorderTokenManager initialTokens={tokens} />
      </main>
    </>
  );
}

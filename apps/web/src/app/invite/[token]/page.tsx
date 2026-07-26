import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { InvitationForm } from "@/components/auth/invitation-form";
import { ButtonLink } from "@/components/ui/button";
import { getInvitation } from "@/features/auth/invitations";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Workspace invitation",
};

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await getInvitation(token);

  if (!invitation) {
    return (
      <AuthShell
        description="This invitation is invalid, expired, revoked, or has already been used. Ask a workspace admin to send a new one."
        eyebrow="Workspace invitation"
        title="Invitation unavailable"
      >
        <ButtonLink block href="/login" size="lg" variant="secondary">
          Go to sign in
        </ButtonLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description={
        <>
          Invited as <strong>{invitation.email}</strong>. Existing users can
          enter their current credentials; new users choose them now.
        </>
      }
      eyebrow="Workspace invitation"
      title={`Join ${invitation.workspaceName}`}
    >
      <InvitationForm token={token} />
    </AuthShell>
  );
}

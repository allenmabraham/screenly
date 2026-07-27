"use client";

import { useState, type FormEvent } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { AlertTriangleIcon, UsersIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatRelativeTime } from "@/lib/format";

type Role = "owner" | "admin" | "member";

type Member = {
  userId: string;
  username: string;
  email: string;
  role: Role;
  joinedAt: string;
};

type Invitation = {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  emailStatus: "queued" | "sent" | "failed";
  failureReason: string | null;
  createdAt: string;
};

const ROLE_TONE: Record<Role, BadgeTone> = {
  owner: "accent",
  admin: "info",
  member: "neutral",
};

const EMAIL_STATUS_TONE: Record<Invitation["emailStatus"], BadgeTone> = {
  sent: "success",
  queued: "neutral",
  failed: "warning",
};

export function MemberManager({
  members,
  invitations,
  currentRole,
}: {
  members: Member[];
  invitations: Invitation[];
  currentRole: "owner" | "admin";
}) {
  const toast = useToast();
  const [invitationRows, setInvitationRows] = useState(invitations);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInviteUrl(null);
    setIsSubmitting(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch("/api/library/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: data.get("email"),
        role: data.get("role"),
      }),
    });
    const result = (await response.json()) as Partial<Invitation> & {
      inviteUrl?: string;
      error?: { message?: string };
    };
    setIsSubmitting(false);

    if (
      !response.ok ||
      !result.id ||
      !result.email ||
      !result.role ||
      !result.expiresAt ||
      !result.createdAt ||
      !result.emailStatus ||
      !result.inviteUrl
    ) {
      setError(result.error?.message ?? "Could not create the invitation.");
      return;
    }

    setInvitationRows((current) => [
      {
        id: result.id!,
        email: result.email!,
        role: result.role!,
        expiresAt: result.expiresAt!,
        acceptedAt: result.acceptedAt ?? null,
        revokedAt: result.revokedAt ?? null,
        emailStatus: result.emailStatus!,
        failureReason: result.failureReason ?? null,
        createdAt: result.createdAt!,
      },
      ...current,
    ]);
    setInviteUrl(result.inviteUrl);
    toast(
      result.emailStatus === "sent"
        ? `Invitation sent to ${result.email}.`
        : "Invitation created. Copy the link below to share it.",
      result.emailStatus === "failed" ? "info" : "success",
    );
    form.reset();
  }

  async function updateInvitation(id: string, action: "resend" | "revoke") {
    setError(null);
    setInviteUrl(null);
    const response = await fetch(`/api/library/invitations/${id}`, {
      method: action === "resend" ? "POST" : "DELETE",
    });
    if (!response.ok) {
      setError(`Could not ${action} the invitation.`);
      return;
    }

    if (action === "resend") {
      const result = (await response.json()) as Partial<Invitation> & {
        inviteUrl: string;
      };
      setInvitationRows((current) =>
        current.map((invitation) =>
          invitation.id === id
            ? {
                ...invitation,
                expiresAt: result.expiresAt ?? invitation.expiresAt,
                emailStatus: result.emailStatus ?? invitation.emailStatus,
                failureReason: result.failureReason ?? invitation.failureReason,
              }
            : invitation,
        ),
      );
      setInviteUrl(result.inviteUrl);
      toast("Invitation resent.", "success");
    } else {
      setInvitationRows((current) =>
        current.map((invitation) =>
          invitation.id === id
            ? { ...invitation, revokedAt: new Date().toISOString() }
            : invitation,
        ),
      );
      toast("Invitation revoked.", "success");
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel__header">
          <div>
            <h2 className="panel__title">Invite a teammate</h2>
            <p className="panel__description">
              Invitees create an account (or sign in with an existing one) from
              the emailed link. There is no open signup.
            </p>
          </div>
        </div>

        <form className="settings-form settings-form--invite" onSubmit={invite}>
          <label className="sr-only" htmlFor="invite-email">
            Invitee email
          </label>
          <input
            className="input"
            id="invite-email"
            name="email"
            placeholder="teammate@example.com"
            required
            type="email"
          />
          <label className="sr-only" htmlFor="invite-role">
            Workspace role
          </label>
          <select
            className="select"
            defaultValue="member"
            id="invite-role"
            name="role"
          >
            <option value="member">Member</option>
            {currentRole === "owner" ? <option value="admin">Admin</option> : null}
            {currentRole === "owner" ? <option value="owner">Owner</option> : null}
          </select>
          <Button disabled={isSubmitting} type="submit" variant="primary">
            {isSubmitting ? "Sending…" : "Send invitation"}
          </Button>
        </form>

        {inviteUrl ? (
          <div className="secret-panel" role="status">
            <div className="secret-panel__head">
              <div>
                <strong>Invitation link</strong>
                <p>
                  Share this link directly if email delivery is unavailable.
                </p>
              </div>
              <CopyButton
                label="Copy link"
                toastMessage="Invitation link copied to your clipboard."
                value={inviteUrl}
                variant="secondary"
              />
            </div>
            <code className="code-well">{inviteUrl}</code>
          </div>
        ) : null}

        {error ? (
          <p className="settings-error" role="alert">
            <AlertTriangleIcon size={15} />
            {error}
          </p>
        ) : null}
      </div>

      <div className="panel">
        <div className="panel__header">
          <div>
            <h2 className="panel__title">
              Members <span className="panel__count">{members.length}</span>
            </h2>
            <p className="panel__description">
              Everyone with access to this workspace library.
            </p>
          </div>
        </div>
        <ul className="settings-list">
          {members.map((member) => (
            <li className="list-row" key={member.userId}>
              <div className="list-row__main">
                <Avatar name={member.username} />
                <div>
                  <div className="list-row__title">{member.username}</div>
                  <div className="list-row__meta">
                    {member.email} · joined {formatDate(member.joinedAt)}
                  </div>
                </div>
              </div>
              <div className="list-row__actions">
                <Badge tone={ROLE_TONE[member.role]}>{member.role}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <div className="panel__header">
          <div>
            <h2 className="panel__title">Invitations</h2>
            <p className="panel__description">
              Pending invitations expire automatically. Resending issues a fresh
              link.
            </p>
          </div>
        </div>

        {invitationRows.length === 0 ? (
          <div className="settings-empty">
            <UsersIcon size={18} />
            No invitations yet.
          </div>
        ) : (
          <ul className="settings-list">
            {invitationRows.map((invitation) => {
              const isActive = !invitation.acceptedAt && !invitation.revokedAt;
              return (
                <li className="list-row" key={invitation.id}>
                  <div className="list-row__main">
                    <Avatar name={invitation.email} />
                    <div>
                      <div className="list-row__title">{invitation.email}</div>
                      <div className="list-row__meta">
                        Invited {formatRelativeTime(invitation.createdAt)}
                        {invitation.failureReason
                          ? ` · ${invitation.failureReason}`
                          : ""}
                      </div>
                    </div>
                  </div>
                  <div className="list-row__actions">
                    <Badge tone={ROLE_TONE[invitation.role]}>
                      {invitation.role}
                    </Badge>
                    {isActive ? (
                      <>
                        <Badge tone={EMAIL_STATUS_TONE[invitation.emailStatus]}>
                          {invitation.emailStatus}
                        </Badge>
                        <Button
                          onClick={() =>
                            updateInvitation(invitation.id, "resend")
                          }
                          size="sm"
                          variant="ghost"
                        >
                          Resend
                        </Button>
                        <Button
                          onClick={() =>
                            updateInvitation(invitation.id, "revoke")
                          }
                          size="sm"
                          variant="quiet-danger"
                        >
                          Revoke
                        </Button>
                      </>
                    ) : (
                      <Badge tone={invitation.acceptedAt ? "success" : "neutral"}>
                        {invitation.acceptedAt ? "Accepted" : "Revoked"}
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

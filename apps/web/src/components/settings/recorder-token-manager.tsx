"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertTriangleIcon, KeyIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatRelativeTime } from "@/lib/format";

type RecorderToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export function RecorderTokenManager({
  initialTokens,
}: {
  initialTokens: RecorderToken[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch("/api/library/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: data.get("name") }),
    });

    if (!response.ok) {
      setError("Could not create the recorder token.");
      return;
    }

    const result = (await response.json()) as { token: string };
    setNewToken(result.token);
    form.reset();
    toast("Recorder token created.", "success");
    startTransition(() => router.refresh());
  }

  async function revoke(id: string) {
    setError(null);
    const response = await fetch(`/api/library/tokens/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setError("Could not revoke the recorder token.");
      setRevokingId(null);
      return;
    }
    setRevokingId(null);
    toast("Recorder token revoked.", "success");
    startTransition(() => router.refresh());
  }

  return (
    <div className={`panel${isPending ? " is-pending" : ""}`}>
      <div className="panel__header">
        <div>
          <h2 className="panel__title">Recorder tokens</h2>
          <p className="panel__description">
            One token per computer. Revoking a token blocks new uploads from that
            device immediately and leaves existing recordings untouched.
          </p>
        </div>
      </div>

      <form className="settings-form" onSubmit={create}>
        <label className="sr-only" htmlFor="token-name">
          Recorder name
        </label>
        <input
          className="input"
          id="token-name"
          maxLength={120}
          name="name"
          placeholder="Recorder name, e.g. Alice’s MacBook Pro"
          required
        />
        <Button type="submit" variant="primary">
          Create token
        </Button>
      </form>

      {newToken ? (
        <div className="secret-panel" role="status">
          <div className="secret-panel__head">
            <div>
              <strong>Copy this token now</strong>
              <p>
                It is stored only as a hash, so it cannot be shown again after
                you leave this page.
              </p>
            </div>
            <CopyButton
              icon="copy"
              label="Copy token"
              toastMessage="Recorder token copied to your clipboard."
              value={newToken}
              variant="secondary"
            />
          </div>
          <code className="code-well">{newToken}</code>
        </div>
      ) : null}

      {error ? (
        <p className="settings-error" role="alert">
          <AlertTriangleIcon size={15} />
          {error}
        </p>
      ) : null}

      {initialTokens.length === 0 ? (
        <EmptyState
          className="empty-state--flush"
          description="Create one token per computer so uploads can be attributed and revoked per device."
          icon={<KeyIcon size={20} />}
          title="No recorder tokens yet"
        />
      ) : (
        <ul className="settings-list">
          {initialTokens.map((token) => (
            <li className="list-row" key={token.id}>
              <div className="list-row__main">
                <span className="settings-icon">
                  <KeyIcon size={16} />
                </span>
                <div>
                  <div className="list-row__title">{token.name}</div>
                  <div className="list-row__meta mono">
                    screenly_{token.tokenPrefix}_•••••••• · created{" "}
                    {formatDate(token.createdAt)}
                  </div>
                </div>
              </div>
              <div className="list-row__actions">
                <span className="list-row__meta">
                  {token.lastUsedAt
                    ? `Used ${formatRelativeTime(token.lastUsedAt)}`
                    : "Never used"}
                </span>
                {revokingId === token.id ? (
                  <>
                    <Button
                      onClick={() => revoke(token.id)}
                      size="sm"
                      variant="danger"
                    >
                      Revoke
                    </Button>
                    <Button
                      autoFocus
                      onClick={() => setRevokingId(null)}
                      size="sm"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => setRevokingId(token.id)}
                    size="sm"
                    variant="quiet-danger"
                  >
                    Revoke
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

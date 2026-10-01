import {
  type ButtonHTMLAttributes,
  type FormEvent,
  type ReactNode,
  useId,
  useState,
} from "react";

import type { AppSnapshot } from "../shared/ipc";
import { command } from "./bridge";

const ICON_PATHS = {
  record: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  library: (
    <>
      <rect height="12" rx="2" width="16" x="4" y="8" />
      <path d="M7 5h10M9 2h6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  pause: <path d="M9 5v14M15 5v14" />,
  play: <path d="m7 4 13 8-13 8V4Z" fill="currentColor" />,
  stop: <rect fill="currentColor" height="12" rx="2" width="12" x="6" y="6" />,
  trash: (
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  upload: <path d="M12 16V4M6 10l6-6 6 6M5 20h14" />,
  monitor: (
    <>
      <rect height="12" rx="2" width="18" x="3" y="4" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  window: (
    <>
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
    </>
  ),
  area: (
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
  ),
  keyboard: (
    <>
      <rect height="12" rx="2" width="20" x="2" y="6" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </>
  ),
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  external: <path d="M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  minus: <path d="M5 12h14" />,
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
      width={size}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <span aria-hidden="true" className="logo-mark" style={{ width: size, height: size }}>
      <svg fill="none" height={size * 0.62} viewBox="0 0 28 28" width={size * 0.62}>
        <rect height="16" rx="3.4" stroke="currentColor" strokeWidth="2.2" width="21" x="3.5" y="5" />
        <path d="M11.6 10.4 17 14l-5.4 3.6v-7.2Z" fill="currentColor" />
        <path d="M10 23.6h8" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      </svg>
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  busy?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  busy = false,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      className={["btn", `btn--${variant}`, `btn--${size}`, className]
        .filter(Boolean)
        .join(" ")}
      type={type}
      {...rest}
      disabled={rest.disabled || busy}
    >
      {busy ? <span aria-hidden="true" className="spinner" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export function Switch({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="switch" htmlFor={id}>
      <input
        checked={checked}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.checked)}
        role="switch"
        type="checkbox"
      />
      <span aria-hidden="true" className="switch__track">
        <span className="switch__thumb" />
      </span>
      <span className="switch__label">{label}</span>
    </label>
  );
}

export function DeviceSelect({
  label,
  value,
  devices,
  onChange,
}: {
  label: string;
  value: string | null;
  devices: MediaDeviceInfo[];
  onChange: (value: string | null) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select
        className="input"
        id={id}
        onChange={(event) => onChange(event.target.value || null)}
        value={value ?? ""}
      >
        <option value="">System default</option>
        {value && !devices.some((device) => device.deviceId === value) ? (
          <option value={value}>Unavailable device</option>
        ) : null}
        {devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `${label} ${index + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Message({
  tone,
  children,
}: {
  tone: "danger" | "warning" | "info" | "success";
  children: ReactNode;
}) {
  const icon: IconName = tone === "success" ? "check" : tone === "info" ? "shield" : "alert";
  return (
    <p className={`message message--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon name={icon} size={15} />
      <span>{children}</span>
    </p>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={["card", className].filter(Boolean).join(" ")}>{children}</div>;
}

export function Spinner() {
  return <span aria-hidden="true" className="spinner" />;
}

export function AuthenticationPanel({ snapshot }: { snapshot: AppSnapshot }) {
  const { account } = snapshot;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const usernameId = useId();
  const passwordId = useId();
  const workspaceId = useId();

  const signIn = (event: FormEvent) => {
    event.preventDefault();
    const submitted = password;
    setPassword("");
    void command({ type: "login", username, password: submitted });
  };

  let content: ReactNode;
  if (account.isAuthenticated) {
    content = (
      <div className="stack stack--sm">
        <div className="row row--between">
          <span className="muted">Signed in as</span>
          <span className="account-name">
            <strong>{account.username}</strong>
            <span className="muted small">{account.email}</span>
          </span>
        </div>
        <div className="row row--between">
          <label className="muted" htmlFor={workspaceId}>
            Workspace
          </label>
          {account.workspaces.length > 1 ? (
            <select
              className="input input--inline"
              disabled={account.isAuthenticating || !account.canChangeAuthentication}
              id={workspaceId}
              onChange={(event) =>
                void command({ type: "switchWorkspace", workspaceID: event.target.value })
              }
              value={account.activeWorkspaceID ?? ""}
            >
              {account.workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          ) : (
            <span id={workspaceId}>{account.activeWorkspaceName ?? "Unavailable"}</span>
          )}
        </div>
        <div className="row row--end">
          {account.isAuthenticating ? (
            <span className="muted small row">
              <Spinner /> Updating account…
            </span>
          ) : null}
          <Button
            disabled={account.isAuthenticating || !account.canChangeAuthentication}
            onClick={() => void command({ type: "signOut" })}
            size="sm"
            variant="danger"
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  } else if (account.isAuthenticating && account.hasStoredSession) {
    content = (
      <p className="row muted">
        <Spinner /> Validating saved sign-in…
      </p>
    );
  } else {
    content = (
      <form className="stack stack--sm" onSubmit={signIn}>
        <div className="field">
          <label className="field__label" htmlFor={usernameId}>
            Username
          </label>
          <input
            autoComplete="username"
            className="input"
            disabled={account.isAuthenticating}
            id={usernameId}
            onChange={(event) => setUsername(event.target.value)}
            value={username}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={passwordId}>
            Password
          </label>
          <input
            autoComplete="current-password"
            className="input"
            disabled={account.isAuthenticating}
            id={passwordId}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </div>
        <div className="row row--between">
          <span className="muted small">
            Your password is used only to sign in and is never saved.
          </span>
          <Button
            busy={account.isAuthenticating}
            disabled={!username.trim() || !password}
            type="submit"
            variant="primary"
          >
            Sign in
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="stack stack--sm">
      {content}
      {account.authenticationError ? (
        <Message tone="danger">{account.authenticationError}</Message>
      ) : null}
    </div>
  );
}

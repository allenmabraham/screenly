"use client";

import { useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { DownloadIcon, KeyIcon, UsersIcon, XIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function UserMenu({
  username,
  email,
  role,
  canManage,
}: {
  username: string;
  email: string;
  role: string;
  canManage: boolean;
}) {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/session", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <Menu
      label={<Avatar name={username} size="sm" />}
      triggerClassName="btn btn--ghost btn--sm btn--icon"
      triggerLabel="Account"
    >
      <div className="menu__user">
        <Avatar name={username} />
        <div>
          <div className="menu__user-name">{username}</div>
          <div className="menu__user-meta">
            {email} · {role}
          </div>
        </div>
      </div>
      <div className="menu__separator" />
      <div className="menu__theme">
        Appearance
        <ThemeToggle />
      </div>
      {canManage ? (
        <>
          <a className="menu__item" href="/library/members" role="menuitem">
            <UsersIcon size={16} />
            Members
          </a>
          <a className="menu__item" href="/library/tokens" role="menuitem">
            <KeyIcon size={16} />
            Recorder tokens
          </a>
        </>
      ) : null}
      <a className="menu__item" href="/download" role="menuitem">
        <DownloadIcon size={16} />
        Download the Mac app
      </a>
      <div className="menu__separator" />
      <button
        className="menu__item menu__item--danger"
        onClick={signOut}
        role="menuitem"
        type="button"
      >
        <XIcon size={16} />
        Sign out
      </button>
    </Menu>
  );
}

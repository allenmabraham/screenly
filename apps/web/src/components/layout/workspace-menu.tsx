"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CheckIcon, ChevronDownIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";

export type WorkspaceOption = {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
};

export function WorkspaceMenu({
  activeWorkspace,
  workspaces,
}: {
  activeWorkspace: WorkspaceOption;
  workspaces: WorkspaceOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [isSwitching, setIsSwitching] = useState(false);

  if (workspaces.length <= 1) {
    return (
      <span className="workspace-trigger" title={activeWorkspace.name}>
        <span className="workspace-trigger__name">{activeWorkspace.name}</span>
      </span>
    );
  }

  async function switchWorkspace(workspaceId: string, close: () => void) {
    if (workspaceId === activeWorkspace.id) {
      close();
      return;
    }

    setIsSwitching(true);
    const response = await fetch("/api/auth/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });

    if (!response.ok) {
      setIsSwitching(false);
      toast("Could not switch workspace.", "error");
      return;
    }

    close();
    router.push("/library");
    router.refresh();
    setIsSwitching(false);
  }

  return (
    <Menu
      align="start"
      label={
        <>
          <span className="workspace-trigger__name">{activeWorkspace.name}</span>
          <ChevronDownIcon className="workspace-trigger__chevron" size={14} />
        </>
      }
      triggerClassName="workspace-trigger"
      triggerLabel="Switch workspace"
    >
      {(close) => (
        <>
          <p className="menu__label">Workspaces</p>
          {workspaces.map((workspace) => (
            <button
              aria-checked={workspace.id === activeWorkspace.id}
              className="menu__item"
              disabled={isSwitching}
              key={workspace.id}
              onClick={() => switchWorkspace(workspace.id, close)}
              role="menuitemradio"
              type="button"
            >
              {workspace.name}
              {workspace.id === activeWorkspace.id ? (
                <CheckIcon className="menu__item__trailing" size={15} />
              ) : (
                <span className="menu__item__trailing">{workspace.role}</span>
              )}
            </button>
          ))}
        </>
      )}
    </Menu>
  );
}

import Link from "next/link";

import { KeyIcon, UsersIcon } from "@/components/ui/icons";

const TABS = [
  { id: "members", href: "/library/members", label: "Members", Icon: UsersIcon },
  {
    id: "tokens",
    href: "/library/tokens",
    label: "Recorder tokens",
    Icon: KeyIcon,
  },
] as const;

export type SettingsTab = (typeof TABS)[number]["id"];

export function SettingsNav({ active }: { active: SettingsTab }) {
  return (
    <nav aria-label="Workspace settings" className="settings-nav">
      {TABS.map(({ id, href, label, Icon }) => (
        <Link
          aria-current={id === active ? "page" : undefined}
          className="settings-nav__item"
          href={href}
          key={id}
        >
          <Icon size={16} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

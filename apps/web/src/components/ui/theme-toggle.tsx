"use client";

import { useEffect, useSyncExternalStore } from "react";

import { MonitorIcon, MoonIcon, SunIcon } from "@/components/ui/icons";
import {
  isThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  Icon: typeof SunIcon;
}> = [
  { value: "system", label: "Match system theme", Icon: MonitorIcon },
  { value: "light", label: "Light theme", Icon: SunIcon },
  { value: "dark", label: "Dark theme", Icon: MoonIcon },
];

const THEME_EVENT = "screenly:themechange";

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    // Private browsing modes can deny storage access.
    return "system";
  }
}

/**
 * The stored preference is external state, so it is read through
 * `useSyncExternalStore` instead of being copied into state inside an effect.
 * That keeps the server snapshot stable ("system") and stays in sync across
 * tabs and across multiple toggles on the same page.
 */
const preferenceStore = {
  subscribe(onChange: () => void) {
    window.addEventListener("storage", onChange);
    window.addEventListener(THEME_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(THEME_EVENT, onChange);
    };
  },
  getSnapshot: readPreference,
  getServerSnapshot: (): ThemePreference => "system",
};

function applyPreference(preference: ThemePreference) {
  const isDark =
    preference === "dark" ||
    (preference === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.setAttribute("data-theme", isDark ? "dark" : "light");
  root.style.colorScheme = isDark ? "dark" : "light";
}

export function ThemeToggle() {
  const preference = useSyncExternalStore(
    preferenceStore.subscribe,
    preferenceStore.getSnapshot,
    preferenceStore.getServerSnapshot,
  );

  useEffect(() => {
    if (preference !== "system") {
      return;
    }

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPreference("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  function select(next: ThemePreference) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Persisting is best effort; the DOM still updates below.
    }
    applyPreference(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <div
      aria-label="Theme"
      className="segmented segmented--icons theme-toggle"
      role="group"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          aria-label={label}
          aria-pressed={preference === value}
          className={`segmented__item${preference === value ? " is-active" : ""}`}
          key={value}
          onClick={() => select(value)}
          title={label}
          type="button"
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  );
}

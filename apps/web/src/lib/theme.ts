export const THEME_STORAGE_KEY = "screenly-theme";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * Runs before first paint so the resolved theme is on <html> from the very
 * first frame: no flash of the wrong theme and no layout shift.
 *
 * "system" is resolved to a concrete value here rather than duplicating the
 * whole dark token block behind a `prefers-color-scheme` media query.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}",s=localStorage.getItem(k),p=s==="light"||s==="dark"?s:null,d=p?p==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches,r=document.documentElement;r.setAttribute("data-theme",d?"dark":"light");r.style.colorScheme=d?"dark":"light";}catch(e){}})()`;

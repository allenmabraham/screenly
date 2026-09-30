export type DesktopPlatform = "macos" | "windows" | "linux";

/** Best-effort guess used only to order download options. */
export function detectDesktopPlatform(
  userAgent: string | null | undefined,
): DesktopPlatform | null {
  const value = userAgent ?? "";
  if (/Android|iPhone|iPad|iPod|CrOS/i.test(value)) {
    return null;
  }
  if (/Windows NT/i.test(value)) {
    return "windows";
  }
  if (/Macintosh|Mac OS X/i.test(value)) {
    return "macos";
  }
  if (/Linux|X11/i.test(value)) {
    return "linux";
  }
  return null;
}

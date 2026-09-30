export const HOTKEY_CHOICES = ["altShiftR", "ctrlAltR", "ctrlShiftR"] as const;

export type HotkeyChoice = (typeof HOTKEY_CHOICES)[number];

export const DEFAULT_HOTKEY: HotkeyChoice = "altShiftR";

const ACCELERATORS: Record<HotkeyChoice, string> = {
  altShiftR: "Alt+Shift+R",
  ctrlAltR: "Control+Alt+R",
  ctrlShiftR: "Control+Shift+R",
};

const LABELS: Record<HotkeyChoice, string> = {
  altShiftR: "Alt+Shift+R",
  ctrlAltR: "Ctrl+Alt+R",
  ctrlShiftR: "Ctrl+Shift+R",
};

export function isHotkeyChoice(value: unknown): value is HotkeyChoice {
  return (
    typeof value === "string" &&
    (HOTKEY_CHOICES as readonly string[]).includes(value)
  );
}

export function hotkeyAccelerator(choice: HotkeyChoice) {
  return ACCELERATORS[choice];
}

export function hotkeyLabel(choice: HotkeyChoice) {
  return LABELS[choice];
}

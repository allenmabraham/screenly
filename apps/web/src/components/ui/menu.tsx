"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

type MenuAlign = "start" | "end";
type MenuSide = "below" | "above";

type MenuProps = {
  /** Rendered inside the trigger button. */
  label: ReactNode;
  /** Accessible name when the trigger has no text (icon-only triggers). */
  triggerLabel?: string;
  triggerClassName?: string;
  panelClassName?: string;
  align?: MenuAlign;
  side?: MenuSide;
  /** `menu` for action lists, `dialog` for richer popovers. */
  role?: "menu" | "dialog";
  /** Fired every time the panel opens — handy for lazy data loading. */
  onOpen?: () => void;
  children: ReactNode | ((close: () => void) => ReactNode);
};

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * One accessible popover implementation for every menu in the app: the
 * workspace switcher, the user menu, sort, card actions and the viewers list.
 *
 * Handles outside clicks, Escape, roving arrow-key focus and focus return to
 * the trigger, and only attaches document listeners while open.
 */
export function Menu({
  label,
  triggerLabel,
  triggerClassName = "btn btn--ghost btn--sm",
  panelClassName = "",
  align = "end",
  side = "below",
  role = "menu",
  onOpen,
  children,
}: MenuProps) {
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  // Focus returns to the trigger when the panel closes, except when the user
  // clicked somewhere else on the page (that would steal their focus back).
  const restoreFocusRef = useRef(true);
  const wasOpenRef = useRef(false);

  const close = useCallback(() => setIsOpen(false), []);

  function toggle() {
    const next = !isOpen;
    restoreFocusRef.current = true;
    setIsOpen(next);
    if (next) {
      onOpen?.();
    }
  }

  useEffect(() => {
    if (wasOpenRef.current && !isOpen && restoreFocusRef.current) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = isOpen;
    restoreFocusRef.current = true;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        restoreFocusRef.current = false;
        setIsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setIsOpen(false);
        return;
      }

      if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp" &&
        event.key !== "Tab"
      ) {
        return;
      }

      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
      if (items.length === 0) {
        return;
      }

      if (event.key === "Tab") {
        // Keep focus inside the panel while it is open.
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const active = document.activeElement;
        if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        currentIndex === -1
          ? event.key === "ArrowDown"
            ? 0
            : items.length - 1
          : (currentIndex + delta + items.length) % items.length;
      items[nextIndex]!.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="menu" ref={containerRef}>
      <button
        aria-controls={isOpen ? panelId : undefined}
        aria-expanded={isOpen}
        aria-haspopup={role === "menu" ? "menu" : "dialog"}
        aria-label={triggerLabel}
        className={triggerClassName}
        onClick={toggle}
        ref={triggerRef}
        title={triggerLabel}
        type="button"
      >
        {label}
      </button>

      {isOpen ? (
        <div
          aria-label={role === "dialog" ? triggerLabel : undefined}
          className={`menu__panel menu__panel--${align} menu__panel--${side} ${panelClassName}`.trim()}
          id={panelId}
          ref={panelRef}
          role={role}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}

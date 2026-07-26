"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AlertTriangleIcon, CheckIcon, SparkleIcon, XIcon } from "@/components/ui/icons";

type ToastVariant = "success" | "error" | "info";

type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toast: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4_000;
const MAX_VISIBLE = 3;

const ICONS: Record<ToastVariant, typeof CheckIcon> = {
  success: CheckIcon,
  error: AlertTriangleIcon,
  info: SparkleIcon,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = nextIdRef.current;
      nextIdRef.current += 1;
      setToasts((current) => [...current, { id, message, variant }].slice(-MAX_VISIBLE));
      timersRef.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      );
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="toast-region" role="status">
        {toasts.map(({ id, message, variant }) => {
          const Icon = ICONS[variant];
          return (
            <div className={`toast toast--${variant}`} key={id}>
              <span className="toast__icon">
                <Icon size={13} />
              </span>
              {message}
              <button
                aria-label="Dismiss notification"
                className="toast__close"
                onClick={() => dismiss(id)}
                type="button"
              >
                <XIcon size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Returns a `toast()` function. Safe to call outside a provider (no-op), so
 * components can be reused on pages that do not mount the toast region.
 */
export function useToast() {
  const context = useContext(ToastContext);
  return context?.toast ?? (() => {});
}

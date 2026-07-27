"use client";

import { useEffect, useRef, useState } from "react";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { CheckIcon, CopyIcon, LinkIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

type CopyButtonProps = {
  /** Literal text, or omit to copy the current page URL. */
  value?: string;
  label?: string;
  copiedLabel?: string;
  toastMessage?: string;
  icon?: "link" | "copy" | "none";
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

export function CopyButton({
  value,
  label = "Copy link",
  copiedLabel = "Copied",
  toastMessage,
  icon = "link",
  variant = "secondary",
  size = "md",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  async function copy() {
    const text = value ?? window.location.href;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast("Copying is blocked by the browser. Select the text instead.", "error");
      return;
    }

    setCopied(true);
    if (toastMessage) {
      toast(toastMessage, "success");
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setCopied(false), 2_000);
  }

  const Icon = copied ? CheckIcon : icon === "copy" ? CopyIcon : LinkIcon;

  return (
    <Button className={className} onClick={copy} size={size} variant={variant}>
      {icon === "none" ? null : <Icon size={16} />}
      {copied ? copiedLabel : label}
    </Button>
  );
}

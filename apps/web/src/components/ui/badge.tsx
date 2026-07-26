import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge--${tone}${className ? ` ${className}` : ""}`}>
      {dot ? <span aria-hidden="true" className="badge__dot" /> : null}
      {children}
    </span>
  );
}

const VIDEO_STATUS: Record<
  "uploading" | "processing" | "ready" | "failed",
  { tone: BadgeTone; label: string }
> = {
  uploading: { tone: "info", label: "Uploading" },
  processing: { tone: "warning", label: "Processing" },
  ready: { tone: "success", label: "Ready" },
  failed: { tone: "danger", label: "Failed" },
};

export function VideoStatusBadge({
  status,
  className,
}: {
  status: "uploading" | "processing" | "ready" | "failed";
  className?: string;
}) {
  const { tone, label } = VIDEO_STATUS[status];
  return (
    <Badge className={className} dot tone={tone}>
      {label}
    </Badge>
  );
}

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
  onMedia = false,
  className,
}: {
  status: "uploading" | "processing" | "ready" | "failed";
  /** Use media-safe contrast when the badge sits on a video thumbnail. */
  onMedia?: boolean;
  className?: string;
}) {
  const { tone, label } = VIDEO_STATUS[status];
  return (
    <Badge
      className={[onMedia ? "badge--on-media" : null, className]
        .filter(Boolean)
        .join(" ")}
      dot
      tone={tone}
    >
      {label}
    </Badge>
  );
}

import { avatarHue, initials } from "@/lib/format";

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={["avatar", size === "md" ? null : `avatar--${size}`, className]
        .filter(Boolean)
        .join(" ")}
      style={{ "--avatar-hue": avatarHue(name) } as React.CSSProperties}
    >
      {initials(name)}
    </span>
  );
}

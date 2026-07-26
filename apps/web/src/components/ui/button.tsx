import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "quiet-danger"
  | "on-media";

export type ButtonSize = "sm" | "md" | "lg";

type SharedProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  block?: boolean;
  className?: string;
  children?: ReactNode;
};

export function buttonClassName({
  variant = "secondary",
  size = "md",
  iconOnly = false,
  block = false,
  className,
}: SharedProps) {
  return [
    "btn",
    `btn--${variant}`,
    size === "md" ? null : `btn--${size}`,
    iconOnly ? "btn--icon" : null,
    block ? "btn--block" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant,
  size,
  iconOnly,
  block,
  className,
  type = "button",
  ...props
}: SharedProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={buttonClassName({ variant, size, iconOnly, block, className })}
      type={type}
      {...props}
    />
  );
}

/** Internal navigation that looks like a button. */
export function ButtonLink({
  variant,
  size,
  iconOnly,
  block,
  className,
  href,
  ...props
}: SharedProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string }) {
  const classes = buttonClassName({ variant, size, iconOnly, block, className });
  const isExternal = /^https?:\/\//.test(href) || href.startsWith("mailto:");

  if (isExternal) {
    return <a className={classes} href={href} {...props} />;
  }

  return <Link className={classes} href={href} {...props} />;
}

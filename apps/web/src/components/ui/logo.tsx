import Link from "next/link";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="logo-mark"
      style={{ width: size, height: size }}
    >
      <svg fill="none" height={size} viewBox="0 0 28 28" width={size}>
        <rect
          height="16"
          rx="3.4"
          stroke="currentColor"
          strokeOpacity="0.92"
          strokeWidth="1.9"
          width="21"
          x="3.5"
          y="5"
        />
        <path d="M11.6 10.4 17 14l-5.4 3.6v-7.2Z" fill="currentColor" />
        <path
          d="M10 23.6h8"
          stroke="currentColor"
          strokeLinecap="round"
          strokeOpacity="0.92"
          strokeWidth="1.9"
        />
      </svg>
    </span>
  );
}

export function Logo({
  href = "/",
  size = 28,
  showWordmark = true,
}: {
  href?: string | null;
  size?: number;
  showWordmark?: boolean;
}) {
  const content = (
    <>
      <LogoMark size={size} />
      {showWordmark ? <span className="logo__word">Screenly</span> : null}
    </>
  );

  if (!href) {
    return <span className="logo">{content}</span>;
  }

  return (
    <Link aria-label="Screenly home" className="logo" href={href}>
      {content}
    </Link>
  );
}

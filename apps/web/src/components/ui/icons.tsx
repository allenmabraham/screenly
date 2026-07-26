/**
 * The single icon source for the app.
 *
 * Every icon is a 24×24 stroke icon that inherits `currentColor`, so it works on
 * any surface and in both themes. They are plain function components with no
 * dependencies, so unused icons are tree-shaken out of route bundles.
 */
import type { SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number;
};

function Icon({ size = 18, ...props }: IconProps & { children?: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.7}
      {...props}
    />
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5.5 19 12 8 18.5V5.5Z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function ReplayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" stroke="currentColor" />
      <path d="M20 3.5V8h-4.5" stroke="currentColor" />
    </Icon>
  );
}

export function VolumeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9.5h3L11.5 6v12L7 14.5H4v-5Z" stroke="currentColor" />
      <path d="M15.5 9.2a4 4 0 0 1 0 5.6" stroke="currentColor" />
      <path d="M18 6.8a7.5 7.5 0 0 1 0 10.4" stroke="currentColor" />
    </Icon>
  );
}

export function VolumeOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9.5h3L11.5 6v12L7 14.5H4v-5Z" stroke="currentColor" />
      <path d="m15.5 9.5 5 5m0-5-5 5" stroke="currentColor" />
    </Icon>
  );
}

export function MaximizeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5" stroke="currentColor" />
    </Icon>
  );
}

export function MinimizeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 4v5H4m11 11v-5h5M15 9V4m0 5h5M9 15v5m0-5H4" stroke="currentColor" />
    </Icon>
  );
}

export function PipIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" />
      <rect x="12" y="11.5" width="7" height="6" rx="1.4" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function GaugeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 17a8.5 8.5 0 1 1 15 0" stroke="currentColor" />
      <path d="m12 12.5 4-3.5" stroke="currentColor" />
      <circle cx="12" cy="13" r="1.4" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" />
      <path d="m16 16 4 4" stroke="currentColor" />
    </Icon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" />
    </Icon>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M4 4l16 16M9.9 5.2A9.6 9.6 0 0 1 12 5c6 0 9.5 6 9.5 6a17 17 0 0 1-2.6 3.3M6.4 7.5A17 17 0 0 0 2.5 11s3.5 6 9.5 6c1 0 2-.2 2.8-.5"
        stroke="currentColor"
      />
      <path d="M10.2 10.3a2.5 2.5 0 0 0 3.5 3.5" stroke="currentColor" />
    </Icon>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M10.6 13.4a3 3 0 0 0 4.24 0l3.54-3.54a3 3 0 1 0-4.24-4.24L12.1 7.66m1.3 2.94a3 3 0 0 0-4.24 0l-3.54 3.54a3 3 0 1 0 4.24 4.24l2.04-2.04"
        stroke="currentColor"
      />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v10m0 0 4-4m-4 4-4-4" stroke="currentColor" />
      <path d="M4.5 17.5v1a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1" stroke="currentColor" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2.4" stroke="currentColor" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" stroke="currentColor" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth={2} />
    </Icon>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 7h15M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" stroke="currentColor" />
      <path d="M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7" stroke="currentColor" />
      <path d="M10.5 11v5.5M13.5 11v5.5" stroke="currentColor" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 19.5h3.2L19 8.2a2 2 0 0 0 0-2.8l-.4-.4a2 2 0 0 0-2.8 0L4.5 16.3v3.2Z" stroke="currentColor" />
      <path d="m14.5 6.5 3 3" stroke="currentColor" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6.5 9.5 5.5 5 5.5-5" stroke="currentColor" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12h14m0 0-5-5m5 5-5 5" stroke="currentColor" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" stroke="currentColor" />
      <path
        d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
        stroke="currentColor"
      />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M20 14.4A8.4 8.4 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4Z"
        stroke="currentColor"
      />
    </Icon>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="18" height="12" rx="2" stroke="currentColor" />
      <path d="M9 20h6m-3-3.5V20" stroke="currentColor" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9.5" cy="8.5" r="3.2" stroke="currentColor" />
      <path d="M3.8 19.2c.6-3 3-4.7 5.7-4.7s5.1 1.7 5.7 4.7" stroke="currentColor" />
      <path d="M16 5.6a3 3 0 0 1 0 5.8M17.2 14.9c2 .5 3.4 2 3.9 4.3" stroke="currentColor" />
    </Icon>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="12" r="3.5" stroke="currentColor" />
      <path d="M11.5 12H21m-3 0v3m-3-3v2.2" stroke="currentColor" />
    </Icon>
  );
}

export function SlackIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.2 4.6a1.6 1.6 0 1 1 3.2 0v4.6a1.6 1.6 0 1 1-3.2 0V4.6Z" stroke="currentColor" />
      <path d="M14.8 11.6a1.6 1.6 0 1 1 0 3.2h-4.6a1.6 1.6 0 1 1 0-3.2h4.6Z" stroke="currentColor" />
      <path d="M4.6 9.2a1.6 1.6 0 1 0 0 3.2h4.6" stroke="currentColor" />
      <path d="M11.6 14.8a1.6 1.6 0 1 0 3.2 0v-4.6" stroke="currentColor" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" />
    </Icon>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 3 6 13.5h4.5L10 21l7.5-10.5H13l.5-7.5Z" stroke="currentColor" />
    </Icon>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4l1.5 4.5L18 10l-4.5 1.5L12 16l-1.5-4.5L6 10l4.5-1.5L12 4Z" stroke="currentColor" />
      <path d="M18 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" stroke="currentColor" />
    </Icon>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M12 4.8 3.6 19.2h16.8L12 4.8Z"
        stroke="currentColor"
      />
      <path d="M12 10v4" stroke="currentColor" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function XIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" />
    </Icon>
  );
}

export function FilmIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.4" stroke="currentColor" />
      <path d="M3 9.5h18M3 14.5h18M8 5v14M16 5v14" stroke="currentColor" />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 5 6v5.5c0 4 2.9 7.4 7 8.9 4.1-1.5 7-4.9 7-8.9V6l-7-2.5Z" stroke="currentColor" />
      <path d="m9 12 2.2 2.2L15.5 10" stroke="currentColor" />
    </Icon>
  );
}

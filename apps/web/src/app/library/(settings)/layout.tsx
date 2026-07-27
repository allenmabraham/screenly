/**
 * Route group for workspace settings. It only groups the segments (the URLs
 * stay `/library/tokens` and `/library/members`) and deliberately fetches
 * nothing, so navigation between settings screens stays instant.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

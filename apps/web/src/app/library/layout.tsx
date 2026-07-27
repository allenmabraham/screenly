import { ToastProvider } from "@/components/ui/toast";

/**
 * Mounts the toast region for every signed-in screen. It deliberately fetches
 * nothing: runtime data in a layout would block `loading.tsx` fallbacks from
 * showing during navigation.
 */
export default function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}

import { VideoGridSkeleton } from "@/components/library/video-grid-skeleton";

/**
 * Instant navigation shell. The real header needs session data, so the skeleton
 * mirrors its geometry to keep the layout stable when the page swaps in.
 */
export default function LibraryLoading() {
  return (
    <>
      <div className="app-bar">
        <div className="shell shell--wide app-bar__inner">
          <div className="skeleton" style={{ width: 108, height: 24 }} />
          <div
            className="skeleton"
            style={{ width: 132, height: 30, borderRadius: 999 }}
          />
          <div className="app-bar__spacer" />
          <div
            className="skeleton"
            style={{ width: 96, height: 30, borderRadius: 999 }}
          />
        </div>
      </div>

      <main className="shell shell--wide page-shell">
        <header className="page-head">
          <div>
            <div className="skeleton" style={{ width: 260, height: 34 }} />
            <div
              className="skeleton skeleton--text"
              style={{ width: 380, marginTop: 14 }}
            />
          </div>
        </header>
        <div className="library-toolbar">
          <div
            className="skeleton"
            style={{ width: 132, height: 38, borderRadius: 999 }}
          />
          <div className="skeleton" style={{ height: 38, flex: 1 }} />
          <div className="skeleton" style={{ width: 128, height: 32 }} />
        </div>
        <VideoGridSkeleton />
      </main>
    </>
  );
}

/**
 * Streaming placeholder for the recordings grid. Rendered from the page's
 * Suspense boundary and from `loading.tsx`, so the shell and toolbar paint
 * immediately instead of waiting on the database and thumbnail signing.
 */
export function VideoGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="video-grid video-grid--skeleton">
      {Array.from({ length: count }, (_, index) => (
        <div className="vcard vcard--skeleton" key={index}>
          <div className="skeleton vcard__preview" />
          <div className="vcard__body">
            <div className="skeleton skeleton--text" style={{ width: "88%" }} />
            <div
              className="skeleton skeleton--text"
              style={{ width: "54%", marginTop: 8 }}
            />
            <div
              className="skeleton skeleton--text"
              style={{ width: "34%", marginTop: 20, height: 10 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

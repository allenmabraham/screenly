import { CheckIcon } from "@/components/ui/icons";

/**
 * The hero visual: a miniature of the product built entirely from CSS and SVG.
 *
 * Deliberately not an image — it costs zero network requests, cannot shift the
 * layout while loading, stays sharp at any density, and themes itself.
 */
export function AppWindow() {
  const cards = [
    {
      title: "Sprint 27 demo",
      meta: "You · 4m ago",
      duration: "0:32",
      tone: 1,
    },
    {
      title: "Bug repro: upload queue",
      meta: "riley · 2h ago",
      duration: "0:14",
      tone: 2,
    },
    {
      title: "Design review notes",
      meta: "jordan · 6h ago",
      duration: "0:21",
      tone: 3,
    },
    { title: "Standup recap", meta: "You · 1d ago", duration: "1:35", tone: 4 },
  ];

  return (
    <div aria-hidden="true" className="app-window">
      <div className="app-window__chrome">
        <span className="app-window__dot" />
        <span className="app-window__dot" />
        <span className="app-window__dot" />
        <span className="app-window__address">screenly.internal/library</span>
      </div>

      <div className="app-window__body">
        <div className="app-window__toolbar">
          <span className="app-window__pill is-active">All</span>
          <span className="app-window__pill">Mine</span>
          <span className="app-window__search" />
        </div>

        <div className="app-window__grid">
          {cards.map((card) => (
            <div className="app-window__card" key={card.title}>
              <div
                className={`app-window__thumb app-window__thumb--${card.tone}`}
              >
                <span className="app-window__duration">{card.duration}</span>
              </div>
              <p className="app-window__card-title">{card.title}</p>
              <p className="app-window__card-meta">{card.meta}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="app-window__toast">
        <span className="app-window__toast-icon">
          <CheckIcon size={12} />
        </span>
        Link copied — upload still running
      </div>
    </div>
  );
}

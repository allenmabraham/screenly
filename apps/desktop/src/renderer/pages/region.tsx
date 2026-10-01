import { type PointerEvent, useEffect, useRef, useState } from "react";

import type { Rect } from "../../core/capture-geometry";
import type { RegionContext } from "../../shared/ipc";
import { command } from "../bridge";
import { mount } from "../mount";

type Point = { x: number; y: number };

const MINIMUM_SIZE = 16;

function normalize(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function RegionSelector() {
  const [context, setContext] = useState<RegionContext | null>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const surfaceRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void command<RegionContext | null>({ type: "getRegionContext" }).then(setContext);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void command({ type: "submitRegion", rect: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toDisplayPoint = (event: PointerEvent) => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    const size = context?.size;
    if (!bounds || !size) {
      return { x: event.clientX, y: event.clientY };
    }
    return {
      x: Math.round(((event.clientX - bounds.left) / bounds.width) * size.width),
      y: Math.round(((event.clientY - bounds.top) / bounds.height) * size.height),
    };
  };

  const selection = start && current ? normalize(start, current) : null;
  const scaleX = surfaceRef.current && context ? surfaceRef.current.clientWidth / context.size.width : 1;
  const scaleY = surfaceRef.current && context ? surfaceRef.current.clientHeight / context.size.height : 1;

  return (
    <main
      className="region"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = toDisplayPoint(event);
        setStart(point);
        setCurrent(point);
      }}
      onPointerMove={(event) => {
        if (start) {
          setCurrent(toDisplayPoint(event));
        }
      }}
      onPointerUp={(event) => {
        if (!start) {
          return;
        }
        const rect = normalize(start, toDisplayPoint(event));
        setStart(null);
        setCurrent(null);
        if (rect.width >= MINIMUM_SIZE && rect.height >= MINIMUM_SIZE) {
          void command({ type: "submitRegion", rect });
        }
      }}
      ref={surfaceRef}
      style={context?.screenshot ? { backgroundImage: `url(${context.screenshot})` } : undefined}
    >
      <div className={`region__scrim${selection ? " region__scrim--hidden" : ""}`} />
      {selection ? (
        <div
          className="region__selection"
          style={{
            left: selection.x * scaleX,
            top: selection.y * scaleY,
            width: selection.width * scaleX,
            height: selection.height * scaleY,
          }}
        >
          <span className="region__size tabular">
            {selection.width} × {selection.height}
          </span>
        </div>
      ) : (
        <p className="region__hint">Drag to select the area to record · Esc to cancel</p>
      )}
    </main>
  );
}

mount(<RegionSelector />);

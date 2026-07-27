"use client";

import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { EyeIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { formatRelativeTime } from "@/lib/format";

type Viewer = {
  viewerName: string;
  watchCount: number;
  lastViewedAt: string;
};

type ViewersResponse = {
  viewCount: number;
  viewers: Viewer[];
};

export function VideoViewers({
  videoId,
  viewCount,
}: {
  videoId: string;
  viewCount: number;
}) {
  const [data, setData] = useState<ViewersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function load() {
    if (data || isLoading) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch(`/api/library/videos/${videoId}/views`);
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
      setData((await response.json()) as ViewersResponse);
    } catch {
      setError("Could not load viewers.");
    } finally {
      setIsLoading(false);
    }
  }

  const totalViews = data?.viewCount ?? viewCount;
  const namedViews =
    data?.viewers.reduce((sum, viewer) => sum + viewer.watchCount, 0) ?? 0;
  const anonymousViews = Math.max(0, totalViews - namedViews);

  return (
    <Menu
      align="start"
      label={
        <>
          <EyeIcon size={15} />
          <span className="tabular">{totalViews}</span>
        </>
      }
      onOpen={load}
      panelClassName="viewers-panel"
      role="dialog"
      side="above"
      triggerClassName="btn btn--ghost btn--sm viewers-trigger"
      triggerLabel={`See who watched · ${totalViews} ${totalViews === 1 ? "view" : "views"}`}
    >
      <p className="menu__label">Who watched</p>
      {error ? <p className="viewers-panel__empty">{error}</p> : null}
      {!error && !data ? (
        <p className="viewers-panel__empty">Loading…</p>
      ) : null}
      {data ? (
        <>
          {data.viewers.length > 0 ? (
            <ul className="viewers-panel__list">
              {data.viewers.map((viewer) => (
                <li className="viewers-panel__row" key={viewer.viewerName}>
                  <Avatar name={viewer.viewerName} size="sm" />
                  <span className="viewers-panel__name">
                    {viewer.viewerName}
                  </span>
                  <span className="viewers-panel__meta tabular">
                    {viewer.watchCount > 1 ? `${viewer.watchCount}× · ` : ""}
                    {formatRelativeTime(viewer.lastViewedAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {anonymousViews > 0 ? (
            <p className="viewers-panel__anonymous">
              {anonymousViews} anonymous{" "}
              {anonymousViews === 1 ? "view" : "views"}
            </p>
          ) : null}
          {data.viewers.length === 0 && anonymousViews === 0 ? (
            <p className="viewers-panel__empty">No views yet.</p>
          ) : null}
        </>
      ) : null}
    </Menu>
  );
}

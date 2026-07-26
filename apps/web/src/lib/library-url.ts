import type { LibrarySort } from "@/features/videos/library-service";

/**
 * Builds library URLs. Kept out of `library-toolbar.tsx` because that module is
 * `"use client"`, and non-component exports of a client module cannot be called
 * from a Server Component.
 */
export function libraryHref({
  query,
  mine,
  sort,
}: {
  query?: string;
  mine?: boolean;
  sort?: LibrarySort;
}) {
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (mine) {
    params.set("mine", "1");
  }
  if (sort && sort !== "newest") {
    params.set("sort", sort);
  }
  const search = params.toString();
  return search ? `/library?${search}` : "/library";
}

export const LIBRARY_SORT_LABELS: Record<LibrarySort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  views: "Most viewed",
};

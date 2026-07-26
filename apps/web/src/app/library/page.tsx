import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { LibraryToolbar } from "@/components/library/library-toolbar";
import { VideoCard } from "@/components/library/video-card";
import { VideoGridSkeleton } from "@/components/library/video-grid-skeleton";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilmIcon, SearchIcon, UsersIcon } from "@/components/ui/icons";
import { canManageWorkspace, listUserWorkspaces } from "@/features/auth/users";
import {
  isLibrarySort,
  listLibraryVideos,
  type LibrarySort,
} from "@/features/videos/library-service";
import { libraryHref } from "@/lib/library-url";
import { getCookieSessionAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    mine?: string | string[];
    sort?: string | string[];
  }>;
}) {
  const authentication = await getCookieSessionAuth();
  if (!authentication) {
    redirect("/login");
  }

  const {
    q: rawQuery,
    mine: rawMine,
    sort: rawSort,
  } = await searchParams;
  const query = typeof rawQuery === "string" ? rawQuery.slice(0, 120) : "";
  const mineOnly = rawMine === "1";
  const sort: LibrarySort = isLibrarySort(rawSort) ? rawSort : "newest";
  const workspaces = await listUserWorkspaces(authentication.user.id);
  const canManage = canManageWorkspace(authentication.workspace.role);

  return (
    <>
      <AppHeader
        active="library"
        activeWorkspace={authentication.workspace}
        canManage={canManage}
        user={authentication.user}
        workspaces={workspaces}
      />

      <main className="shell shell--wide page-shell" id="main">
        <header className="page-head">
          <div>
            <h1 className="page-head__title">Team recordings</h1>
            <p className="page-head__description">
              Everything shared in {authentication.workspace.name}. Links work
              the moment a recording starts uploading.
            </p>
          </div>
          {canManage ? (
            <div className="page-head__actions">
              <ButtonLink href="/library/members" variant="secondary">
                <UsersIcon size={16} />
                Invite teammates
              </ButtonLink>
            </div>
          ) : null}
        </header>

        <LibraryToolbar mineOnly={mineOnly} query={query} sort={sort} />

        {/*
          The grid streams inside its own Suspense boundary so the header and
          toolbar are interactive while the query and thumbnail URLs resolve.
          `key` restarts the boundary whenever the query changes.
        */}
        <Suspense
          fallback={<VideoGridSkeleton />}
          key={`${query}|${mineOnly}|${sort}`}
        >
          <VideoGrid
            currentUserId={authentication.user.id}
            mineOnly={mineOnly}
            query={query}
            sort={sort}
            workspaceId={authentication.workspace.id}
          />
        </Suspense>
      </main>
    </>
  );
}

async function VideoGrid({
  workspaceId,
  currentUserId,
  query,
  mineOnly,
  sort,
}: {
  workspaceId: string;
  currentUserId: string;
  query: string;
  mineOnly: boolean;
  sort: LibrarySort;
}) {
  const videos = await listLibraryVideos(
    workspaceId,
    query,
    mineOnly ? currentUserId : undefined,
    sort,
  );

  if (videos.length === 0) {
    return (
      <EmptyState
        actions={
          query || mineOnly ? (
            <ButtonLink href={libraryHref({})} variant="secondary">
              {query ? "Clear search" : "Show all recordings"}
            </ButtonLink>
          ) : (
            <ButtonLink href="/download" variant="primary">
              Get the Mac recorder
            </ButtonLink>
          )
        }
        description={
          query
            ? "Try a different title, or clear the search to see everything."
            : mineOnly
              ? "Recordings you upload from the Mac app while signed in appear here."
              : "Record something with the Mac app and it will show up here the moment the upload starts."
        }
        icon={query ? <SearchIcon size={20} /> : <FilmIcon size={20} />}
        title={
          query
            ? `No recordings match “${query}”`
            : mineOnly
              ? "You haven’t recorded anything yet"
              : "No recordings yet"
        }
      />
    );
  }

  return (
    <>
      <section aria-label="Recordings" className="video-grid">
        {videos.map((video) => (
          <VideoCard
            currentUserId={currentUserId}
            key={video.id}
            video={video}
          />
        ))}
      </section>
      {videos.length >= 50 ? (
        <p className="library-note">
          Showing the 50 most recent recordings.{" "}
          <Link href={libraryHref({ query, mine: mineOnly, sort: "oldest" })}>
            Sort by oldest
          </Link>{" "}
          to see the rest.
        </p>
      ) : null}
    </>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { ChevronDownIcon, SearchIcon, XIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import type { LibrarySort } from "@/features/videos/library-service";
import { libraryHref, LIBRARY_SORT_LABELS } from "@/lib/library-url";

const SEARCH_DEBOUNCE_MS = 250;

export function LibraryToolbar({
  query,
  mineOnly,
  sort,
}: {
  query: string;
  mineOnly: boolean;
  sort: LibrarySort;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const isTypingRef = useRef(false);

  // "/" focuses search, the way every content tool does it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Debounced, URL-driven search: the query stays shareable and the back button
  // keeps working, without a request per keystroke.
  useEffect(() => {
    if (!isTypingRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      isTypingRef.current = false;
      startTransition(() => {
        router.replace(libraryHref({ query: value, mine: mineOnly, sort }), {
          scroll: false,
        });
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [mineOnly, router, sort, value]);

  function onChange(next: string) {
    isTypingRef.current = true;
    setValue(next);
  }

  function clear() {
    isTypingRef.current = true;
    setValue("");
    inputRef.current?.focus();
  }

  return (
    <div className={`library-toolbar${isPending ? " is-pending" : ""}`}>
      {/*
        These hrefs intentionally use the committed `query` prop rather than the
        live input value: rebuilding them on every keystroke would make Next
        prefetch a new URL per character.
      */}
      <div className="segmented" role="group" aria-label="Filter recordings">
        <Link
          aria-current={mineOnly ? undefined : "page"}
          className={`segmented__item${mineOnly ? "" : " is-active"}`}
          href={libraryHref({ query, mine: false, sort })}
        >
          All
        </Link>
        <Link
          aria-current={mineOnly ? "page" : undefined}
          className={`segmented__item${mineOnly ? " is-active" : ""}`}
          href={libraryHref({ query, mine: true, sort })}
        >
          Mine
        </Link>
      </div>

      <div className="library-search">
        <SearchIcon className="library-search__icon" size={16} />
        <label className="sr-only" htmlFor="library-search">
          Search recordings
        </label>
        <input
          autoComplete="off"
          className="library-search__input"
          id="library-search"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && value) {
              event.preventDefault();
              clear();
            }
          }}
          placeholder="Search recordings"
          ref={inputRef}
          type="search"
          value={value}
        />
        {value ? (
          <button
            aria-label="Clear search"
            className="library-search__clear"
            onClick={clear}
            type="button"
          >
            <XIcon size={14} />
          </button>
        ) : (
          <kbd aria-hidden="true" className="library-search__kbd">
            /
          </kbd>
        )}
      </div>

      <Menu
        align="end"
        label={
          <>
            {LIBRARY_SORT_LABELS[sort]}
            <ChevronDownIcon size={14} />
          </>
        }
        triggerClassName="btn btn--secondary btn--sm"
        triggerLabel="Sort recordings"
      >
        {(close) => (
          <>
            <p className="menu__label">Sort by</p>
            {(Object.keys(LIBRARY_SORT_LABELS) as LibrarySort[]).map((option) => (
              <Link
                aria-checked={sort === option}
                className="menu__item"
                href={libraryHref({ query, mine: mineOnly, sort: option })}
                key={option}
                onClick={close}
                // Inside a closed menu there is nothing to prefetch for.
                prefetch={false}
                role="menuitemradio"
              >
                {LIBRARY_SORT_LABELS[option]}
              </Link>
            ))}
          </>
        )}
      </Menu>
    </div>
  );
}

import { useCallback, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Compass,
  Library,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { HomePage } from "./HomePage";
import { ProfilePage } from "./ProfilePage";
import type { AnimeSearchResult } from "../catalog-types";
import type { AnimeSummary } from "../anilist-types";
import type { HistoryEntry } from "../lib/history";

type AniListSection = "overview" | "discover" | "library";

type AniListRoute =
  | { view: AniListSection }
  | {
      view: "media";
      id: number;
      title?: string;
      parent: AniListSection;
      originLabel?: string;
    };

interface RouteEntry {
  route: AniListRoute;
  scrollY: number;
}

interface AniListPageProps {
  setSearchQuery: (value: string) => void;
  setResults: (value: AnimeSearchResult[]) => void;
  onSelectAnime: (
    anime: AnimeSearchResult,
    options?: { episode?: string | null; resumeSeconds?: number | null },
  ) => void;
  onResume: (item: HistoryEntry) => void;
  initialSelectedId?: number | null;
}

const sections = [
  {
    id: "overview" as const,
    labelKey: "anilistWorkspace.overview",
    descriptionKey: "anilistWorkspace.overviewTabDescription",
    icon: UserRound,
  },
  {
    id: "discover" as const,
    labelKey: "anilistWorkspace.discover",
    descriptionKey: "anilistWorkspace.discoverTabDescription",
    icon: Compass,
  },
  {
    id: "library" as const,
    labelKey: "anilistWorkspace.library",
    descriptionKey: "anilistWorkspace.libraryTabDescription",
    icon: Library,
  },
];

function routeSection(route: AniListRoute): AniListSection {
  return route.view === "media" ? route.parent : route.view;
}

export function AniListPage({
  setSearchQuery,
  setResults,
  onSelectAnime,
  onResume,
  initialSelectedId = null,
}: AniListPageProps) {
  const { t } = useTranslation();

  const [routeHistory, setRouteHistory] = useState<RouteEntry[]>(() =>
    initialSelectedId
      ? [
          { route: { view: "discover" }, scrollY: 0 },
          {
            route: {
              view: "media",
              id: initialSelectedId,
              parent: "discover",
            },
            scrollY: 0,
          },
        ]
      : [{ route: { view: "overview" }, scrollY: 0 }],
  );

  const [historyIndex, setHistoryIndex] = useState(() =>
    initialSelectedId ? 1 : 0,
  );

  const [lastCollectionSection, setLastCollectionSection] = useState<
    "discover" | "library"
  >("discover");

  const currentRoute = routeHistory[historyIndex].route;
  const visibleSection = routeSection(currentRoute);

  const collectionSection =
    visibleSection === "discover" || visibleSection === "library"
      ? visibleSection
      : lastCollectionSection;

  const restoreScroll = (scrollY: number) =>
    window.requestAnimationFrame(() =>
      window.scrollTo({
        top: scrollY,
        behavior: "auto",
      }),
    );

  const pushRoute = (route: AniListRoute) => {
    const nextHistory = routeHistory.slice(0, historyIndex + 1);

    nextHistory[historyIndex] = {
      ...nextHistory[historyIndex],
      scrollY: window.scrollY,
    };

    nextHistory.push({
      route,
      scrollY: 0,
    });

    setRouteHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);

    const section = routeSection(route);

    if (section === "discover" || section === "library") {
      setLastCollectionSection(section);
    }

    window.scrollTo({
      top: 0,
      behavior: "auto",
    });
  };

  const goBack = () => {
    if (historyIndex <= 0) return;

    const targetIndex = historyIndex - 1;

    const nextHistory = routeHistory.map((entry, index) =>
      index === historyIndex
        ? {
            ...entry,
            scrollY: window.scrollY,
          }
        : entry,
    );

    setRouteHistory(nextHistory);
    setHistoryIndex(targetIndex);

    restoreScroll(nextHistory[targetIndex].scrollY);
  };

  const goForward = () => {
    if (historyIndex >= routeHistory.length - 1) return;

    const targetIndex = historyIndex + 1;

    const nextHistory = routeHistory.map((entry, index) =>
      index === historyIndex
        ? {
            ...entry,
            scrollY: window.scrollY,
          }
        : entry,
    );

    setRouteHistory(nextHistory);
    setHistoryIndex(targetIndex);

    restoreScroll(nextHistory[targetIndex].scrollY);
  };

  const openMedia = (
    media: Pick<AnimeSummary, "id" | "title">,
    parent: AniListSection = visibleSection,
    originLabel?: string,
  ) => {
    pushRoute({
      view: "media",
      id: media.id,
      title: media.title,
      parent,
      originLabel,
    });
  };

  const resolveMediaTitle = useCallback((media: AnimeSummary) => {
    setRouteHistory((entries) =>
      entries.map((entry) =>
        entry.route.view === "media" && entry.route.id === media.id
          ? {
              ...entry,
              route: {
                ...entry.route,
                title: media.title,
              },
            }
          : entry,
      ),
    );
  }, []);

  const sectionLabel = (section: AniListSection) =>
    t(`anilistWorkspace.${section}`);

  const selectSection = (section: AniListSection) => {
    if (currentRoute.view === section) return;

    pushRoute({
      view: section,
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-5">
      {/* Workspace Navigation */}
      <section
        className="
          m3-card
          relative
          overflow-hidden
          p-4
        "
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-400/0 via-m3-primary to-fuchsia-500/0" />

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            disabled={historyIndex === 0}
            onClick={goBack}
            className="icon-button !size-9 disabled:opacity-35"
            aria-label={t("anilistWorkspace.goBack")}
          >
            <ArrowLeft size={16} />
          </button>

          <button
            type="button"
            disabled={historyIndex >= routeHistory.length - 1}
            onClick={goForward}
            className="icon-button !size-9 disabled:opacity-35"
            aria-label={t("anilistWorkspace.goForward")}
          >
            <ArrowRight size={16} />
          </button>

          <nav
            className="
              flex
              items-center
              gap-1
              overflow-hidden
              text-xs
            "
          >
            <span className="font-black text-m3-primary">
              {t("nav.anilist")}
            </span>

            {currentRoute.view !== "overview" && (
              <>
                <ChevronRight size={14} className="text-m3-outline" />

                <span className="font-bold">
                  {sectionLabel(visibleSection)}
                </span>
              </>
            )}

            {currentRoute.view === "media" && (
              <>
                <ChevronRight size={14} className="text-m3-outline" />

                <span className="truncate font-black text-m3-primary">
                  {currentRoute.title ?? t("anilistWorkspace.animeDetails")}
                </span>
              </>
            )}
          </nav>
        </div>

        {/* Tabs */}
        <div
          className="
            grid
            grid-cols-3
            gap-2
          "
        >
          {sections.map(({ id, labelKey, descriptionKey, icon: Icon }) => {
            const active = visibleSection === id;

            return (
              <button
                key={id}
                type="button"
                onClick={() => selectSection(id)}
                className={`
                    group
                    flex
                    items-center
                    gap-3
                    rounded-2xl
                    px-4
                    py-3
                    text-left
                    transition-all

                    ${
                      active
                        ? `
                          bg-m3-primary
                          text-m3-on-primary
                          shadow-lg
                        `
                        : `
                          text-m3-on-surface-variant
                          hover:bg-m3-on-surface/10
                          hover:text-m3-on-surface
                        `
                    }
                  `}
              >
                <Icon size={20} />

                <div className="min-w-0">
                  <strong className="block text-sm">{t(labelKey)}</strong>

                  <span
                    className={`
                        hidden
                        truncate
                        text-[10px]
                        lg:block

                        ${
                          active
                            ? "text-m3-on-primary/70"
                            : "text-m3-on-surface-variant"
                        }
                      `}
                  >
                    {t(descriptionKey)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Content */}

      {currentRoute.view === "overview" ? (
        <ProfilePage onOpenMedia={(media) => openMedia(media, "overview")} />
      ) : (
        <HomePage
          view={collectionSection}
          setSearchQuery={setSearchQuery}
          setResults={setResults}
          onSelectAnime={onSelectAnime}
          onResume={onResume}
          selectedMediaId={
            currentRoute.view === "media" ? currentRoute.id : null
          }
          onOpenMedia={(media, originLabel) =>
            openMedia(
              media,
              currentRoute.view === "media"
                ? currentRoute.parent
                : collectionSection,
              originLabel,
            )
          }
          onCloseMedia={goBack}
          onMediaResolved={resolveMediaTitle}
        />
      )}
    </div>
  );
}

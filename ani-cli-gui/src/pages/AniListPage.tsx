import { useCallback, useState } from "react";
import { Compass, Library, UserRound } from "lucide-react";
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

  const selectSection = (section: AniListSection) => {
    if (currentRoute.view === section) return;

    pushRoute({
      view: section,
    });
  };

  return (
    <div className="page">
      {/* Tabs */}
      <section className="anilist-workspace-nav">
        <div className="anilist-workspace-tabs">
          {sections.map(({ id, labelKey, descriptionKey, icon: Icon }) => {
            const active = visibleSection === id;

            return (
              <button
                key={id}
                type="button"
                onClick={() => selectSection(id)}
                className={`anilist-workspace-tab ${
                  active ? "anilist-workspace-tab-active" : ""
                }`}
              >
                <Icon size={17} />

                <span className="anilist-workspace-tab-content">
                  <strong>{t(labelKey)}</strong>
                  <span>{t(descriptionKey)}</span>
                </span>
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

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  Flame,
  Loader2,
  ListPlus,
  LogIn,
  LogOut,
  Play,
  Search,
  Sparkles,
  TrendingUp,
  UserRound,
} from "lucide-react";
import type { AnimeSearchResult } from "../lib/api";
import { readHistory, type HistoryEntry } from "../lib/history";
import type {
  AnimeSummary,
  AniListStatus,
  DashboardData,
} from "../anilist-types";
import {
  CollectionGrid,
  DashboardShelf,
  DetailsView,
} from "../components/home";

interface HomePageProps {
  setSearchQuery: (val: string) => void;
  setResults: (val: AnimeSearchResult[]) => void;
  onSelectAnime: (
    anime: AnimeSearchResult,
    options?: { episode?: string | null; resumeSeconds?: number | null },
  ) => void;
  onResume: (item: HistoryEntry) => void;
  selectedMediaId?: number | null;
  onOpenMedia?: (media: AnimeSummary, originLabel?: string) => void;
  onCloseMedia?: () => void;
  onMediaResolved?: (media: AnimeSummary) => void;
  view?: "dashboard" | "discover" | "library";
}

interface EpisodeSuggestion {
  episode: string;
  resumeSeconds?: number;
  label: string;
}

function episodeLabel(media: AnimeSummary, t: ReturnType<typeof useTranslation>["t"]) {
  if (media.nextAiringEpisode)
    return `Ep ${Math.max(1, media.nextAiringEpisode.episode - 1)}${media.episodes ? ` / ${media.episodes}` : ""}`;
  return media.episodes
    ? t("home.episodeCount", { count: media.episodes })
    : (media.format ?? t("home.animeFallback"));
}

function timeUntil(
  timestamp: number,
  t: ReturnType<typeof useTranslation>["t"],
) {
  const hours = Math.max(
    0,
    Math.round((timestamp * 1000 - Date.now()) / 3_600_000),
  );
  if (hours < 24) return t("home.inHours", { count: hours });
  return t("home.inDays", { count: Math.round(hours / 24) });
}

const LIST_STATUSES: AniListStatus[] = [
  "CURRENT",
  "PLANNING",
  "COMPLETED",
  "PAUSED",
  "DROPPED",
  "REPEATING",
];

export function HomePage({
  setSearchQuery,
  setResults,
  onSelectAnime,
  onResume,
  selectedMediaId,
  onOpenMedia,
  onCloseMedia,
  onMediaResolved,
  view = "dashboard",
}: HomePageProps) {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [localSelectedId, setLocalSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [discoverTab, setDiscoverTab] = useState("trending");
  const [libraryTab, setLibraryTab] = useState("current");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [aniListQuery, setAniListQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AnimeSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void window
      .aniPlay!.aniList.dashboard.get()
      .then(setDashboard)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : t("home.unavailable"),
        ),
      )
      .finally(() => setLoading(false));
  }, [t]);
  useEffect(() => {
    void window
      .aniPlay!.aniList.dashboard.get()
      .then(setDashboard)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : t("home.unavailable"),
        ),
      )
      .finally(() => setLoading(false));
  }, [t]);
  const signIn = async () => {
    setAuthBusy(true);
    setError(null);
    try {
      await window.aniPlay!.aniList.auth.start();
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("home.signInFailed"));
    } finally {
      setAuthBusy(false);
    }
  };
  const logout = async () => {
    await window.aniPlay!.aniList.auth.logout();
    load();
  };

  const searchAniList = async () => {
    const query = aniListQuery.trim();
    if (!query || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const items = await window.aniPlay!.aniList.media.search(query);
      setSearchResults(items);
      setDiscoverTab("search");
    } catch (cause) {
      setSearchResults([]);
      setSearchError(
        cause instanceof Error
          ? cause.message
          : t("anilistWorkspace.searchFailed"),
      );
    } finally {
      setSearching(false);
    }
  };

  const openMapped = (
    media: AnimeSummary,
    anime: AnimeSearchResult,
    suggestion: EpisodeSuggestion,
  ) => {
    const selection = {
      ...anime,
      aniListMediaId: media.id,
      coverUrl: media.coverUrl || undefined,
    };
    setSearchQuery(anime.name);
    setResults([selection]);
    onSelectAnime(selection, {
      episode: suggestion.episode,
      resumeSeconds: suggestion.resumeSeconds ?? null,
    });
  };

  const selectedId =
    selectedMediaId !== undefined ? selectedMediaId : localSelectedId;
  const openMedia = (media: AnimeSummary, originLabel?: string) =>
    onOpenMedia
      ? onOpenMedia(media, originLabel)
      : setLocalSelectedId(media.id);
  const closeMedia = () =>
    onCloseMedia ? onCloseMedia() : setLocalSelectedId(null);
  if (selectedId)
    return (
      <DetailsView
        key={selectedId}
        id={selectedId}
        onBack={closeMedia}
        onOpenAnime={openMapped}
        onChanged={load}
        onOpenLinkedMedia={(media) => openMedia(media)}
        onMediaResolved={onMediaResolved}
      />
    );
  const history = readHistory().slice(0, 4);
  const featured =
    dashboard?.current[0] ?? dashboard?.trending[0] ?? dashboard?.seasonal[0];
  const discoverCollections = dashboard
    ? {
        trending: dashboard.trending,
        seasonal: dashboard.seasonal,
        airing: [
          ...new Map(
            dashboard.airing.map((item) => [item.media.id, item.media]),
          ).values(),
        ],
        recommended: dashboard.recommendations,
        search: searchResults,
      }
    : { trending: [], seasonal: [], airing: [], recommended: [], search: [] };
  const libraryCollections: Record<string, AnimeSummary[]> = dashboard
    ? {
        current: dashboard.current,
        planning: dashboard.planning,
        completed: dashboard.completed,
        paused: dashboard.paused,
        dropped: dashboard.dropped,
        repeating: dashboard.repeating,
      }
    : {
        current: [],
        planning: [],
        completed: [],
        paused: [],
        dropped: [],
        repeating: [],
      };
  const normalizedLibraryQuery = libraryQuery.trim().toLowerCase();
  const activeLibraryItems = (libraryCollections[libraryTab] ?? []).filter(
    (item) =>
      !normalizedLibraryQuery ||
      [item.title, item.titleEnglish, item.titleRomaji, ...item.synonyms].some(
        (title) => title?.toLowerCase().includes(normalizedLibraryQuery),
      ),
  );
  const workspaceTitle =
    view === "discover"
      ? t("anilistWorkspace.discoverTitle")
      : view === "library"
        ? t("anilistWorkspace.libraryTitle")
        : t("home.dashboardTitle");
  const workspaceDescription =
    view === "discover"
      ? t("anilistWorkspace.discoverDescription")
      : view === "library"
        ? t("anilistWorkspace.libraryDescription")
        : t("home.discovery");
  return (
    <div className="home-page">
      {/* Workspace Header */}
      <section className="home-header">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="home-eyebrow">
              <Flame size={14} className="inline mr-1" /> {workspaceDescription}
            </p>
            <h2 className="home-title mt-2">
              {workspaceTitle}
            </h2>
          </div>
          {dashboard?.session.authenticated ? (
            <div className="home-auth">
              <div className="home-auth-info">
                <p className="home-auth-label">
                  {t("home.signedInAs")}
                </p>
                <p className="home-auth-name">{dashboard.session.user?.name}</p>
              </div>
              {dashboard.session.user?.avatar ? (
                <img
                  src={dashboard.session.user.avatar}
                  className="home-auth-avatar"
                  alt=""
                />
              ) : (
                <div className="home-auth-avatar-placeholder">
                  <UserRound size={18} />
                </div>
              )}
              <button
                onClick={() => void logout()}
                className="icon-button"
                title={t("home.signOut")}
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button
              disabled={authBusy || !dashboard?.session.configured}
              onClick={() => void signIn()}
              className="primary-action"
              title={
                dashboard?.session.configured
                  ? undefined
                  : t("home.signInUnavailable")
              }
            >
              {authBusy ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <LogIn size={18} />
              )}{" "}
              {t("profile.signIn")}
            </button>
          )}
        </div>
      </section>

      {dashboard?.stale ? (
        <p className="home-alert mb-4">
          {t("home.stale")}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="home-alert home-alert--error mb-4"
        >
          {error}
        </p>
      ) : null}

      {view === "discover" && !loading && dashboard ? (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void searchAniList();
            }}
            className="home-search-form"
          >
            <label className="home-search-input">
              <Search size={17} className="home-search-icon" />
              <input
                value={aniListQuery}
                onChange={(event) => setAniListQuery(event.target.value)}
                placeholder={t("anilistWorkspace.searchPlaceholder")}
              />
            </label>
            <button
              type="submit"
              disabled={!aniListQuery.trim() || searching}
              className="primary-action"
            >
              {searching ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Search size={17} />
              )}{" "}
              {t("anilistWorkspace.search")}
            </button>
          </form>
          {searchError ? (
            <p
              role="alert"
              className="home-alert home-alert--error mb-4"
            >
              {searchError}
            </p>
          ) : null}

          {/* Discover Tabs */}
          <div className="home-tabs">
            {[
              {
                id: "trending",
                label: t("home.trending"),
                count: dashboard.trending.length,
              },
              {
                id: "seasonal",
                label: t("home.seasonal"),
                count: dashboard.seasonal.length,
              },
              {
                id: "airing",
                label: t("home.airingSoon"),
                count: discoverCollections.airing.length,
              },
              {
                id: "recommended",
                label: t("home.recommended"),
                count: dashboard.recommendations.length,
              },
              ...(searchResults.length || discoverTab === "search"
                ? [
                    {
                      id: "search",
                      label: t("anilistWorkspace.searchResults"),
                      count: searchResults.length,
                    },
                  ]
                : []),
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDiscoverTab(tab.id)}
                className={`home-tab ${discoverTab === tab.id ? "active" : ""}`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          <CollectionGrid
            items={
              discoverCollections[
                discoverTab as keyof typeof discoverCollections
              ] ?? []
            }
            onSelect={(item) =>
              openMedia(
                item,
                discoverTab === "search"
                  ? t("anilistWorkspace.searchResults")
                  : discoverTab === "airing"
                    ? t("home.airingSoon")
                    : t(`home.${discoverTab}`),
              )
            }
            empty={t("anilistWorkspace.noDiscoverResults")}
          />
        </>
      ) : null}
      {view === "library" && !loading && dashboard ? (
        <>
          {history.length ? (
            <section className="home-continue">
              <div className="home-section-header">
                <h3 className="flex items-center gap-2">
                  <Play size={18} className="home-section-header-icon" />
                  {t("home.continueWatching")}
                </h3>
              </div>
              <div className="home-continue-list">
                {history.map((item) => (
                  <button
                    key={`${item.animeId}:${item.episode}`}
                    onClick={() => onResume(item)}
                    className="home-continue-item"
                  >
                    {item.coverUrl ? (
                      <img
                        src={item.coverUrl}
                        alt=""
                        className="home-continue-cover"
                      />
                    ) : null}
                    <span className="home-continue-info">
                      <strong className="home-continue-title">
                        {item.animeName}
                      </strong>
                      <span className="home-continue-episode">
                        {t("downloads.episode", { episode: item.episode })}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {!dashboard.session.authenticated ? (
            <div className="home-library-auth">
              <ListPlus className="home-library-auth-icon" size={30} />
              <h3>
                {t("anilistWorkspace.librarySignInTitle")}
              </h3>
              <p>
                {t("anilistWorkspace.librarySignInDescription")}
              </p>
            </div>
          ) : (
            <>
              <label className="home-library-filter">
                <Search size={17} className="home-search-icon" />
                <input
                  value={libraryQuery}
                  onChange={(event) => setLibraryQuery(event.target.value)}
                  placeholder={t("anilistWorkspace.filterLibrary")}
                />
              </label>

              {/* Library Tabs */}
              <div className="home-tabs">
                {LIST_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setLibraryTab(status.toLowerCase())}
                    className={`home-tab ${libraryTab === status.toLowerCase() ? "active" : ""}`}
                  >
                    {t(`home.statuses.${status.toLowerCase()}`)} ({libraryCollections[status.toLowerCase()].length})
                  </button>
                ))}
              </div>

              <CollectionGrid
                items={activeLibraryItems}
                onSelect={(item) =>
                  openMedia(item, t(`home.statuses.${libraryTab}`))
                }
                empty={
                  normalizedLibraryQuery
                    ? t("anilistWorkspace.noLibraryMatches")
                    : t("anilistWorkspace.emptyStatus")
                }
              />
            </>
          )}
        </>
      ) : null}
      {loading ? (
        <div className="home-loading">
          <Loader2 className="animate-spin" />
        </div>
      ) : dashboard && view === "dashboard" ? (
        <>
          <div className="home-dashboard-grid">
            {featured ? (
              <button
                type="button"
                onClick={() => openMedia(featured)}
                className="home-featured"
              >
                <span
                  className="home-featured-bg"
                  style={{
                    backgroundImage: `url(${featured.bannerUrl || featured.coverUrl})`,
                  }}
                />
                <span className="home-featured-overlay" />
                <span className="home-featured-content">
                  <span className="home-featured-badge">
                    <TrendingUp size={13} /> {t("home.trending")}
                  </span>
                  <strong className="home-featured-title">
                    {featured.title}
                  </strong>
                  <span className="home-featured-meta">
                    {episodeLabel(featured, t)}
                    {featured.averageScore
                      ? ` · ★ ${featured.averageScore}%`
                      : ""}
                  </span>
                  <span className="home-featured-action">
                    <Play size={17} /> {t("home.viewDetails")}
                  </span>
                </span>
              </button>
            ) : null}
            <aside className="home-airing">
              <h3 className="home-airing-header">
                <CalendarClock size={18} className="shrink-0" />
                {t("home.airingSoon")}
              </h3>
              <div className="home-airing-list">
                {dashboard.airing.slice(0, 6).map((item) => (
                  <button
                    type="button"
                    key={`${item.media.id}:${item.episode}`}
                    onClick={() => openMedia(item.media)}
                    className="home-airing-item"
                  >
                    {item.media.coverUrl ? (
                      <img
                        src={item.media.coverUrl}
                        alt=""
                        className="home-airing-cover"
                      />
                    ) : null}
                    <span className="home-airing-content">
                      <strong className="home-airing-title">
                        {item.media.title}
                      </strong>
                      <span className="home-airing-time">
                        {t("home.airingLabel", {
                          episode: item.episode,
                          time: timeUntil(item.airingAt, t),
                        })}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </aside>
          </div>
          {history.length ? (
            <section className="home-continue">
              <div className="home-section-header">
                <h3 className="flex items-center gap-2">
                  <Play size={18} className="home-section-header-icon" />
                  {t("home.continueWatching")}
                </h3>
              </div>
              <div className="home-continue-list">
                {history.map((item) => (
                  <button
                    key={`${item.animeId}:${item.episode}`}
                    onClick={() => onResume(item)}
                    className="home-continue-item"
                  >
                    {item.coverUrl ? (
                      <img
                        src={item.coverUrl}
                        alt=""
                        className="home-continue-cover"
                      />
                    ) : null}
                    <span className="home-continue-info">
                      <strong className="home-continue-title">
                        {item.animeName}
                      </strong>
                      <span className="home-continue-episode">
                        {t("downloads.episode", { episode: item.episode })}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <DashboardShelf
              title={t("home.discover")}
              icon={<Sparkles size={18} className="home-section-header-icon" />}
              tabs={[
                {
                  id: "trending",
                  label: t("home.trending"),
                  items: dashboard.trending,
                },
                {
                  id: "seasonal",
                  label: t("home.seasonal"),
                  items: dashboard.seasonal,
                },
                {
                  id: "recommended",
                  label: t("home.recommended"),
                  items: dashboard.recommendations,
                },
              ]}
              onSelect={(item) => openMedia(item)}
            />
            <DashboardShelf
              title={t("home.library")}
              icon={<ListPlus size={18} className="home-section-header-icon" />}
              tabs={[
                {
                  id: "watching",
                  label: t("home.watching"),
                  items: dashboard.current,
                },
                {
                  id: "planning",
                  label: t("home.planning"),
                  items: dashboard.planning,
                },
                {
                  id: "completed",
                  label: t("home.completed"),
                  items: dashboard.completed,
                },
              ]}
              onSelect={(item) => openMedia(item)}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Magnet,
  MonitorPlay,
  Search,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { PlayerPage } from "./PlayerPage";
import { addHistory } from "../lib/history";
import {
  getTranslationType,
  invokeEpisodes,
  invokeLinks,
  openProviderEpisode,
  TRANSLATION_TYPE_KEY,
  type CatalogProvider,
  type TranslationType,
} from "../lib/api";
import type { AnimeDetails } from "../anilist-types";
import {
  buildWatchTogetherContent,
  hasControllableWatchTogetherSource,
} from "../lib/watch-together-content";
import type { WatchTogetherCreateContext } from "../watch-together-types";
import { useWatchTogether } from "../contexts/WatchTogetherContext";
import { TorrentSourceDialog } from "../components/aniplay/DownloadItem/TorrentSourceDialog";

interface StreamLink {
  url: string;
  resolution: string;
  hls: boolean;
  provider: string;
  downloadable: boolean;
  embed?: boolean;
  torrent?: boolean;
}

interface AnimePageProps {
  anime: {
    id: string;
    name: string;
    episodes: number;
    aniListMediaId?: number;
    coverUrl?: string;
    catalogProvider: CatalogProvider;
  };
  onBack: () => void;
  initialEpisode?: string | null;
  initialResumeSeconds?: number | null;
  initialTranslationType?: TranslationType | null;
  initialTorrentEpisode?: string | null;
  initialTorrentQuery?: string | null;
  onEpisodeStarted?: (animeId: string, episode: string) => void;
  onOpenWatchTogether?: () => void;
  onWatchTogetherContextChange?: (
    context: WatchTogetherCreateContext | null,
  ) => void;
}

const EPISODES_PER_PAGE = 60;

export function AnimePage({
  anime,
  onBack,
  initialEpisode,
  initialResumeSeconds,
  initialTranslationType,
  initialTorrentEpisode,
  initialTorrentQuery,
  onEpisodeStarted,
  onWatchTogetherContextChange,
}: AnimePageProps) {
  const { t } = useTranslation();
  const initialSelectedTranslationType =
    initialTranslationType ?? getTranslationType();
  const initialEpisodes =
    initialTorrentEpisode && anime.episodes > 0
      ? Array.from({ length: anime.episodes }, (_value, index) =>
          String(index + 1),
        )
      : [];
  const initialEpisodesKey = initialTorrentEpisode
    ? `${anime.catalogProvider}:${anime.id}:${initialSelectedTranslationType}`
    : "";
  const [episodes, setEpisodes] = useState<string[]>(initialEpisodes);
  const [loadedEpisodesKey, setLoadedEpisodesKey] =
    useState(initialEpisodesKey);
  const [playingLinks, setPlayingLinks] = useState<StreamLink[]>([]);
  const [playingEp, setPlayingEp] = useState<string>("");
  const [playingTranslationType, setPlayingTranslationType] =
    useState<TranslationType>("sub");
  const [selectedTranslationType, setSelectedTranslationType] =
    useState<TranslationType>(initialSelectedTranslationType);
  const [loadingEp, setLoadingEp] = useState<string | null>(null);
  const [episodeQuery, setEpisodeQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [browserFallbackEpisode, setBrowserFallbackEpisode] = useState<
    string | null
  >(null);
  const [torrentDialogOpen, setTorrentDialogOpen] = useState(
    Boolean(initialTorrentEpisode),
  );
  const [torrentEpisode, setTorrentEpisode] = useState<string | null>(
    initialTorrentEpisode ?? null,
  );
  const [torrentCatalogDeferred, setTorrentCatalogDeferred] = useState(
    Boolean(initialTorrentEpisode),
  );
  const [aniListMetadata, setAniListMetadata] = useState(() => ({
    mediaId: anime.aniListMediaId,
    coverUrl: anime.coverUrl,
  }));
  const [animeDetails, setAnimeDetails] = useState<AnimeDetails | null>(null);
  const [episodePage, setEpisodePage] = useState(0);
  const [idleQuoteIndex, setIdleQuoteIndex] = useState<number | null>(null);
  const [sourceStatusIndex, setSourceStatusIndex] = useState(0);
  const { state: watchTogetherState, setContent: setWatchTogetherContent } =
    useWatchTogether();
  const restoredRef = useRef<string | null>(null);
  const torrentStartedRef = useRef(false);
  const supportsTranslationSwitch =
    anime.catalogProvider !== "desu" && anime.catalogProvider !== "docchi";
  const episodesKey = `${anime.catalogProvider}:${anime.id}:${selectedTranslationType}`;
  const loadingEpisodes = loadedEpisodesKey !== episodesKey;
  const watchTogetherGuestLocked =
    watchTogetherState?.connected === true &&
    watchTogetherState.role === "guest";

  useEffect(() => {
    if (!playingEp || playingLinks.length === 0) {
      onWatchTogetherContextChange?.(null);
      return;
    }
    onWatchTogetherContextChange?.({
      content: buildWatchTogetherContent(
        anime,
        playingEp,
        playingTranslationType,
      ),
      playback: { position: 0, paused: true, revision: 0 },
      controllable:
        !playingLinks.some((link) => link.torrent) &&
        hasControllableWatchTogetherSource(playingLinks),
    });
    return () => onWatchTogetherContextChange?.(null);
  }, [
    anime,
    onWatchTogetherContextChange,
    playingEp,
    playingLinks,
    playingTranslationType,
  ]);

  useEffect(() => {
    if (anime.aniListMediaId && anime.coverUrl) return;
    void window.aniPlay?.aniList.mapping
      .enrich(anime, selectedTranslationType)
      .then((media) => {
        if (media)
          setAniListMetadata({
            mediaId: media.id,
            coverUrl: media.coverUrl || undefined,
          });
      })
      .catch(() => {});
  }, [anime, selectedTranslationType]);

  useEffect(() => {
    if (!aniListMetadata.mediaId) return;
    let cancelled = false;
    void window.aniPlay?.aniList.media
      .get(aniListMetadata.mediaId)
      .then((media) => {
        if (!cancelled) setAnimeDetails(media);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [aniListMetadata.mediaId]);

  const handlePlay = useCallback(
    (
      ep: string,
      translationType: TranslationType = selectedTranslationType,
    ) => {
      if (loadingEp === ep) return;
      if (
        watchTogetherGuestLocked &&
        watchTogetherState?.content?.episode !== ep
      )
        return;
      const episodeIndex = episodes.indexOf(ep);
      if (episodeIndex >= 0)
        setEpisodePage(Math.floor(episodeIndex / EPISODES_PER_PAGE));
      setLoadingEp(ep);
      setSourceStatusIndex(0);
      setError(null);
      setBrowserFallbackEpisode(null);
      if (playingLinks.some((link) => link.torrent))
        void window.aniPlay?.torrent.stop();

      invokeLinks(anime.id, ep, translationType, anime.catalogProvider)
        .then((res) => {
          setLoadingEp(null);
          if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            const resumeSeconds =
              initialEpisode === ep &&
              typeof initialResumeSeconds === "number" &&
              Number.isFinite(initialResumeSeconds)
                ? Math.max(0, initialResumeSeconds)
                : 0;

            setPlayingLinks(res.data);
            setPlayingEp(ep);
            setPlayingTranslationType(translationType);
            onEpisodeStarted?.(anime.id, ep);
            addHistory({
              animeId: anime.id,
              animeName: anime.name,
              episode: ep,
              progressSeconds: resumeSeconds,
              aniListMediaId: aniListMetadata.mediaId,
              coverUrl: aniListMetadata.coverUrl,
              catalogProvider: anime.catalogProvider,
            });
          } else {
            setError(res.error || t("anime.noStreams"));
            if (
              anime.catalogProvider === "desu" ||
              anime.catalogProvider === "docchi" ||
              anime.catalogProvider === "anidb" ||
              anime.catalogProvider === "anikoto" ||
              anime.catalogProvider === "anikoto2"
            )
              setBrowserFallbackEpisode(ep);
          }
        })
        .catch((cause: unknown) => {
          setLoadingEp(null);
          setError(
            cause instanceof Error ? cause.message : t("anime.lookupFailed"),
          );
          if (
            anime.catalogProvider === "desu" ||
            anime.catalogProvider === "docchi" ||
            anime.catalogProvider === "anidb" ||
            anime.catalogProvider === "anikoto" ||
            anime.catalogProvider === "anikoto2"
          )
            setBrowserFallbackEpisode(ep);
        });
      if (watchTogetherState?.connected && watchTogetherState.role === "host") {
        void setWatchTogetherContent(
          buildWatchTogetherContent(anime, ep, translationType),
        ).catch(() => {});
      }
    },
    [
      anime,
      aniListMetadata.mediaId,
      aniListMetadata.coverUrl,
      episodes,
      initialEpisode,
      initialResumeSeconds,
      loadingEp,
      onEpisodeStarted,
      playingLinks,
      selectedTranslationType,
      setWatchTogetherContent,
      t,
      watchTogetherGuestLocked,
      watchTogetherState,
    ],
  );

  const openTorrent = useCallback(
    (episode: string) => {
      if (watchTogetherGuestLocked) return;
      setTorrentEpisode(episode);
      setTorrentDialogOpen(true);
    },
    [watchTogetherGuestLocked],
  );

  const playTorrent = useCallback(
    (stream: StreamLink) => {
      if (!torrentEpisode) return;
      torrentStartedRef.current = true;
      setPlayingLinks([stream]);
      setPlayingEp(torrentEpisode);
      setPlayingTranslationType(selectedTranslationType);
      setError(null);
      setBrowserFallbackEpisode(null);
      onEpisodeStarted?.(anime.id, torrentEpisode);
      addHistory({
        animeId: anime.id,
        animeName: anime.name,
        episode: torrentEpisode,
        progressSeconds: 0,
        aniListMediaId: aniListMetadata.mediaId,
        coverUrl: aniListMetadata.coverUrl,
        catalogProvider: anime.catalogProvider,
      });
    },
    [
      anime,
      aniListMetadata.coverUrl,
      aniListMetadata.mediaId,
      onEpisodeStarted,
      selectedTranslationType,
      torrentEpisode,
    ],
  );

  const closePlayer = useCallback(() => {
    if (playingLinks.some((link) => link.torrent))
      void window.aniPlay?.torrent.stop();
    setPlayingLinks([]);
  }, [playingLinks]);

  useEffect(
    () => () => {
      if (playingLinks.some((link) => link.torrent))
        void window.aniPlay?.torrent.stop();
    },
    [playingLinks],
  );

  const selectTranslationType = useCallback(
    (value: TranslationType) => {
      if (value === selectedTranslationType || watchTogetherGuestLocked) return;
      localStorage.setItem(TRANSLATION_TYPE_KEY, value);
      setSelectedTranslationType(value);
      setPlayingLinks([]);
      setError(null);
      setBrowserFallbackEpisode(null);
      if (playingEp) {
        const episode = playingEp;
        setPlayingEp("");
        handlePlay(episode, value);
      }
    },
    [handlePlay, playingEp, selectedTranslationType, watchTogetherGuestLocked],
  );

  useEffect(() => {
    if (torrentCatalogDeferred) return;
    let cancelled = false;
    const requestKey = episodesKey;
    invokeEpisodes(anime.id, anime.catalogProvider, selectedTranslationType)
      .then((res) => {
        if (cancelled) return;
        if (res.success && Array.isArray(res.data)) {
          setEpisodes(res.data);
          setError(null);
        } else {
          setEpisodes([]);
          setError(res.error || t("anime.episodesFailed"));
        }
        setLoadedEpisodesKey(requestKey);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setEpisodes([]);
        setError(
          cause instanceof Error ? cause.message : t("anime.episodesFailed"),
        );
        setLoadedEpisodesKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [
    anime.id,
    anime.catalogProvider,
    selectedTranslationType,
    episodesKey,
    t,
    torrentCatalogDeferred,
  ]);

  useEffect(() => {
    if (!initialEpisode || loadingEpisodes) return;
    if (!episodes.includes(initialEpisode)) return;
    const key = `${anime.id}:${initialEpisode}:${selectedTranslationType}`;
    if (restoredRef.current === key) return;
    restoredRef.current = key;
    handlePlay(initialEpisode);
  }, [
    initialEpisode,
    episodes,
    loadingEpisodes,
    anime.id,
    handlePlay,
    selectedTranslationType,
  ]);

  useEffect(() => {
    const shouldShowIdleQuote =
      !loadingEpisodes && !loadingEp && playingLinks.length === 0;
    if (!shouldShowIdleQuote) {
      const resetTimer = window.setTimeout(() => setIdleQuoteIndex(null), 0);
      return () => window.clearTimeout(resetTimer);
    }

    let rotateTimer: number | undefined;
    const startTimer = window.setTimeout(() => {
      const quotes = t("anime.idleQuotes", { returnObjects: true }) as string[];
      setIdleQuoteIndex((current) =>
        current === null ? 0 : (current + 1) % quotes.length,
      );
      rotateTimer = window.setInterval(() => {
        const nextQuotes = t("anime.idleQuotes", {
          returnObjects: true,
        }) as string[];
        setIdleQuoteIndex((current) =>
          current === null ? 0 : (current + 1) % nextQuotes.length,
        );
      }, 30_000);
    }, 45_000);

    return () => {
      window.clearTimeout(startTimer);
      if (rotateTimer !== undefined) window.clearInterval(rotateTimer);
    };
  }, [loadingEp, loadingEpisodes, playingLinks.length, t]);

  const idleQuotes = t("anime.idleQuotes", { returnObjects: true }) as string[];
  const sourceStatusMessages = t(
    `anime.sourceLoading.${anime.catalogProvider}`,
    { returnObjects: true },
  ) as unknown;
  const sourceStatuses = Array.isArray(sourceStatusMessages)
    ? sourceStatusMessages.filter(
        (message): message is string => typeof message === "string",
      )
    : (t("anime.sourceLoading.default", { returnObjects: true }) as string[]);
  const sourceStatus =
    sourceStatuses[sourceStatusIndex % Math.max(sourceStatuses.length, 1)] ??
    t("anime.loadingSourcesBody");

  useEffect(() => {
    if (!loadingEp) return;
    const timer = window.setInterval(() => {
      setSourceStatusIndex((current) => current + 1);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [loadingEp]);

  const visibleEpisodes = episodeQuery.trim()
    ? episodes.filter((episode) => episode.includes(episodeQuery.trim()))
    : episodes;
  const episodePageCount = Math.max(
    1,
    Math.ceil(episodes.length / EPISODES_PER_PAGE),
  );
  const displayedEpisodes = episodeQuery.trim()
    ? visibleEpisodes
    : visibleEpisodes.slice(
        episodePage * EPISODES_PER_PAGE,
        (episodePage + 1) * EPISODES_PER_PAGE,
      );

  return (
    <div className="anime-page">
      <div className="anime-page__header">
        <div className="anime-page__header-main">
          <button
            onClick={onBack}
            aria-label={t("anime.backToBrowse")}
            className="anime-page__back"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="anime-page__heading">
            <p className="anime-page__eyebrow">{t("anime.nowBrowsing")}</p>

            <h2>{anime.name}</h2>
          </div>
        </div>

        {(playingEp || browserFallbackEpisode) && (
          <button
            type="button"
            onClick={() => openTorrent(browserFallbackEpisode || playingEp)}
            disabled={watchTogetherGuestLocked}
            className="anime-page__torrent-button"
          >
            <Magnet size={16} />
            <span>{t("torrent.action")}</span>
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="anime-page__error">
          <div className="anime-page__error-icon">
            <AlertCircle size={18} />
          </div>

          <span className="anime-page__error-message">{error}</span>

          <div className="anime-page__error-actions">
            {browserFallbackEpisode && (
              <button
                type="button"
                onClick={() => openTorrent(browserFallbackEpisode)}
                disabled={watchTogetherGuestLocked}
                className="anime-page__error-action"
              >
                <Magnet size={15} />
                {t("torrent.tryTorrent")}
              </button>
            )}

            {browserFallbackEpisode && (
              <button
                type="button"
                onClick={() =>
                  void openProviderEpisode(
                    anime.id,
                    browserFallbackEpisode,
                    anime.catalogProvider,
                    selectedTranslationType,
                  ).then((result) => {
                    if (!result.success) {
                      setError(result.error || t("anime.browserFailed"));
                    }
                  })
                }
                className="anime-page__error-action"
              >
                <ExternalLink size={15} />
                {t("anime.openInBrowser")}
              </button>
            )}

            <button
              type="button"
              onClick={() => setError(null)}
              className="anime-page__error-action"
            >
              {t("anime.dismiss")}
            </button>
          </div>
        </div>
      )}

      <div
        className={`anime-page__workspace ${
          watchTogetherState?.code
            ? "anime-page__workspace--watch-together"
            : ""
        }`}
      >
        {!watchTogetherState?.code && (
          <aside className="anime-page__details">
            <div className="anime-page__details-cover">
              {aniListMetadata.coverUrl ? (
                <>
                  <img
                    src={aniListMetadata.coverUrl}
                    alt=""
                    className="anime-page__details-backdrop"
                  />

                  <img
                    src={aniListMetadata.coverUrl}
                    alt=""
                    className="anime-page__details-poster"
                  />
                </>
              ) : (
                <div className="anime-page__details-placeholder">
                  <MonitorPlay size={28} />
                </div>
              )}
            </div>

            <div className="anime-page__details-content">
              <h3>{animeDetails?.title ?? anime.name}</h3>

              <div className="anime-page__details-meta">
                {animeDetails?.format ? (
                  <span>{animeDetails.format}</span>
                ) : null}

                {animeDetails?.seasonYear ? (
                  <span>{animeDetails.seasonYear}</span>
                ) : null}

                {animeDetails?.averageScore ? (
                  <span>★ {animeDetails.averageScore}%</span>
                ) : null}
              </div>

              {animeDetails?.description ? (
                <p className="anime-page__details-description">
                  {animeDetails.description}
                </p>
              ) : null}

              {animeDetails?.genres.length ? (
                <div className="anime-page__genres">
                  {animeDetails.genres.slice(0, 5).map((genre) => (
                    <span key={genre}>{genre}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </aside>
        )}

        <aside className="anime-page__episodes">
          <div className="anime-page__episodes-header">
            <div>
              <span className="anime-page__panel-eyebrow">
                {t("anime.episodes")}
              </span>

              <h3>{anime.name}</h3>
            </div>

            <span className="anime-page__episode-count">
              {episodes.length || anime.episodes}
            </span>
          </div>

          {supportsTranslationSwitch && (
            <div
              className="anime-page__translation"
              role="group"
              aria-label={t("anime.audioVersion")}
            >
              {(["sub", "dub"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectTranslationType(value)}
                  disabled={watchTogetherGuestLocked}
                  aria-pressed={selectedTranslationType === value}
                  className={
                    selectedTranslationType === value
                      ? "anime-page__translation-option anime-page__translation-option--active"
                      : "anime-page__translation-option"
                  }
                >
                  {value === "sub" ? t("anime.subbed") : t("anime.dubbed")}
                </button>
              ))}
            </div>
          )}

          {!loadingEpisodes && episodes.length > 12 && (
            <div className="anime-page__search">
              <Search size={15} />

              <input
                type="search"
                inputMode="decimal"
                value={episodeQuery}
                onChange={(event) => setEpisodeQuery(event.target.value)}
                placeholder={t("anime.findEpisode")}
                aria-label={t("anime.findEpisode")}
              />
            </div>
          )}

          {!loadingEpisodes && !episodeQuery.trim() && episodePageCount > 1 ? (
            <div className="anime-page__pagination">
              <button
                type="button"
                className="anime-page__pagination-button"
                disabled={episodePage === 0}
                onClick={() => setEpisodePage((page) => Math.max(0, page - 1))}
                aria-label={t("anime.previousEpisodes")}
              >
                <ChevronLeft size={14} />
              </button>

              <span>
                {displayedEpisodes[0]}–{displayedEpisodes.at(-1)}
              </span>

              <button
                type="button"
                className="anime-page__pagination-button"
                disabled={episodePage >= episodePageCount - 1}
                onClick={() =>
                  setEpisodePage((page) =>
                    Math.min(episodePageCount - 1, page + 1),
                  )
                }
                aria-label={t("anime.nextEpisodes")}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          ) : null}

          {loadingEpisodes ? (
            <div className="anime-page__episodes-loading">
              <div className="anime-page__loading-icon">
                <MonitorPlay size={26} />
              </div>
            </div>
          ) : (
            <div className="anime-page__episode-list">
              {displayedEpisodes.map((ep) => {
                const isActive = playingEp === ep;
                const isLoading = loadingEp === ep;

                return (
                  <button
                    key={ep}
                    disabled={
                      isLoading ||
                      (watchTogetherGuestLocked && playingEp !== ep)
                    }
                    className={`anime-page__episode ${
                      isActive ? "anime-page__episode--active" : ""
                    } ${isLoading ? "anime-page__episode--loading" : ""}`}
                    onClick={() => handlePlay(ep)}
                  >
                    <span>{ep}</span>

                    {isLoading ? (
                      <Loader2
                        size={12}
                        className="anime-page__episode-spinner"
                      />
                    ) : null}
                  </button>
                );
              })}

              {displayedEpisodes.length === 0 && (
                <p className="anime-page__empty">
                  {t("anime.noMatchingEpisode")}
                </p>
              )}
            </div>
          )}
        </aside>

        <section
          className={`anime-page__player ${
            watchTogetherState?.code ? "anime-page__player--watch-together" : ""
          }`}
        >
          {playingLinks.length > 0 ? (
            <PlayerPage
              key={`${anime.id}:${playingEp}`}
              mode="embedded"
              links={playingLinks}
              title={`${anime.name} - Ep ${playingEp}`}
              onBack={closePlayer}
              animeId={anime.id}
              animeName={anime.name}
              episode={playingEp}
              translationType={playingTranslationType}
              initialResumeSeconds={
                initialEpisode === playingEp ? initialResumeSeconds : null
              }
              aniListMediaId={aniListMetadata.mediaId}
              coverUrl={aniListMetadata.coverUrl}
              catalogProvider={anime.catalogProvider}
            />
          ) : (
            <div className="anime-page__player-empty">
              <span className="anime-page__player-icon">
                {loadingEp ? (
                  <Loader2 size={28} className="anime-page__spinner" />
                ) : (
                  <MonitorPlay size={28} />
                )}
              </span>

              <p className="anime-page__player-title">
                {loadingEp
                  ? t("anime.loadingSourcesTitle", {
                      episode: loadingEp,
                    })
                  : t("anime.readyTitle")}
              </p>

              <p className="anime-page__player-description">
                {loadingEp
                  ? sourceStatus
                  : idleQuoteIndex === null
                    ? t("anime.readyBody")
                    : idleQuotes[idleQuoteIndex]}
              </p>
            </div>
          )}
        </section>
      </div>

      {torrentEpisode ? (
        <TorrentSourceDialog
          open={torrentDialogOpen}
          animeName={anime.name}
          searchQuery={initialTorrentQuery ?? undefined}
          episode={torrentEpisode}
          onClose={() => {
            setTorrentDialogOpen(false);

            if (!torrentStartedRef.current) {
              setTorrentCatalogDeferred(false);
            }
          }}
          onInternalPlay={playTorrent}
        />
      ) : null}
    </div>
  );
}

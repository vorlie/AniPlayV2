import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ListPlus,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import type { TFunction } from "i18next";
import {
  getCatalogProvider,
  getTranslationType,
  invokeSearch,
  type AnimeSearchResult,
  type CatalogProvider,
} from "../../lib/api";
import type {
  AnimeDetails,
  AnimeSummary,
  AniListStatus,
  CatalogCandidate,
  CatalogMapping,
  ListUpdateInput,
} from "../../anilist-types";
import { readHistory } from "../../lib/history";
import { NumberStepper } from "./NumberStepper";
import { Section } from "./Section";
import { RelationsSection } from "./RelationsSection";
import { CandidateModal, type CandidateDialog } from "./CandidateModal";

const LIST_STATUSES: AniListStatus[] = [
  "CURRENT",
  "PLANNING",
  "COMPLETED",
  "PAUSED",
  "DROPPED",
  "REPEATING",
];

interface EpisodeSuggestion {
  episode: string;
  resumeSeconds?: number;
  label: string;
}

interface PlaybackTarget {
  anime: AnimeSearchResult;
  mapping?: CatalogMapping;
}

function providerLabel(provider: CatalogProvider) {
  if (provider === "desu") return "Desu";
  if (provider === "docchi") return "Docchi";
  if (provider === "anidb") return "AniDB.app";
  if (provider === "anikoto2") return "Anikoto 2";
  return "Anikoto 1";
}

function queryCandidates(media: AnimeSummary) {
  return [
    ...new Set(
      [
        media.titleEnglish,
        media.titleRomaji,
        media.title,
        ...media.synonyms,
      ].filter((item): item is string => Boolean(item)),
    ),
  ].slice(0, 3);
}

function suggestedEpisode(
  media: AnimeSummary,
  t: TFunction,
): EpisodeSuggestion {
  const history = readHistory().find(
    (item) => item.aniListMediaId === media.id,
  );
  if (history)
    return {
      episode: history.episode,
      resumeSeconds: history.progressSeconds,
      label: t("home.continueEpisode", { episode: history.episode }),
    };
  const progress = media.listState?.progress ?? 0;
  const next = Math.max(1, progress + 1);
  const episode = media.episodes ? Math.min(next, media.episodes) : next;
  return {
    episode: String(episode),
    label:
      progress > 0
        ? t("home.progressSuggests", { episode })
        : t("home.startEpisode"),
  };
}

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function scorePlaybackCandidate(
  media: AnimeSummary,
  anime: AnimeSearchResult,
): CatalogCandidate {
  const candidateName = normalizeTitle(anime.name);
  const titles = [
    media.title,
    media.titleEnglish,
    media.titleRomaji,
    ...media.synonyms,
  ]
    .filter((item): item is string => Boolean(item))
    .map(normalizeTitle);
  let confidence = 0;
  const reasons: string[] = [];
  if (titles.includes(candidateName)) {
    confidence += 0.82;
    reasons.push("exact title");
  } else if (
    titles.some(
      (title) => title.includes(candidateName) || candidateName.includes(title),
    )
  ) {
    confidence += 0.58;
    reasons.push("partial title");
  } else {
    const words = new Set(candidateName.split(" "));
    const best = Math.max(
      ...titles.map(
        (title) =>
          title.split(" ").filter((word) => words.has(word)).length /
          Math.max(words.size, title.split(" ").length),
      ),
      0,
    );
    confidence += best * 0.55;
    if (best > 0.5) reasons.push("similar title");
  }
  if (media.episodes && anime.episodes) {
    if (media.episodes === anime.episodes) {
      confidence += 0.14;
      reasons.push("episode count");
    } else if (Math.abs(media.episodes - anime.episodes) > 2) {
      confidence -= 0.12;
    }
  }
  return { anime, confidence: Math.max(0, Math.min(1, confidence)), reasons };
}

function rankPlaybackCandidates(
  media: AnimeSummary,
  items: AnimeSearchResult[],
) {
  return items
    .map((anime) => scorePlaybackCandidate(media, anime))
    .sort((a, b) => b.confidence - a.confidence);
}

interface DetailsViewProps {
  id: number;
  onBack: () => void;
  onOpenAnime: (
    media: AnimeSummary,
    anime: AnimeSearchResult,
    suggestion: EpisodeSuggestion,
  ) => void;
  onChanged: () => void;
  onOpenLinkedMedia?: (media: AnimeSummary) => void;
  onMediaResolved?: (media: AnimeSummary) => void;
}

export function DetailsView({
  id,
  onBack,
  onOpenAnime,
  onChanged,
  onOpenLinkedMedia,
  onMediaResolved,
}: DetailsViewProps) {
  const { t } = useTranslation();
  const [media, setMedia] = useState<AnimeDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<AniListStatus>("PLANNING");
  const [progress, setProgress] = useState(0);
  const [score, setScore] = useState(0);
  const [repeat, setRepeat] = useState(0);
  const [target, setTarget] = useState<PlaybackTarget | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [candidateDialog, setCandidateDialog] =
    useState<CandidateDialog | null>(null);

  const provider = getCatalogProvider();
  const translationType = getTranslationType();
  const suggestion = useMemo(
    () => (media ? suggestedEpisode(media, t) : null),
    [media, t],
  );
  const hasListChanges = Boolean(
    media &&
    (!media.listState ||
      status !== media.listState.status ||
      progress !== media.listState.progress ||
      score !== media.listState.score ||
      repeat !== media.listState.repeat),
  );

  const resetListDraft = () => {
    setStatus(media?.listState?.status ?? "PLANNING");
    setProgress(media?.listState?.progress ?? 0);
    setScore(media?.listState?.score ?? 0);
    setRepeat(media?.listState?.repeat ?? 0);
  };

  const showMedia = useCallback(
    (item: AnimeDetails) => {
      setMedia(item);
      onMediaResolved?.(item);
      setStatus(item.listState?.status ?? "PLANNING");
      setProgress(item.listState?.progress ?? 0);
      setScore(item.listState?.score ?? 0);
      setRepeat(item.listState?.repeat ?? 0);
    },
    [onMediaResolved],
  );

  const searchForCandidates = useCallback(
    async (item: AnimeSummary, query: string) => {
      const response = await invokeSearch(query, provider);
      if (!response.success)
        throw new Error(response.error || t("browse.searchFailed"));
      return rankPlaybackCandidates(item, response.data ?? []);
    },
    [provider, t],
  );

  const preparePlaybackTarget = useCallback(
    async (item: AnimeSummary) => {
      setMatchLoading(true);
      setMatchError(null);
      try {
        for (const query of queryCandidates(item)) {
          const response = await invokeSearch(query, provider);
          if (!response.success || !response.data?.length) continue;
          const resolution = await window.aniPlay!.aniList.mapping.resolve(
            item,
            response.data,
            translationType,
          );
          if (resolution.mapping) {
            setTarget({
              mapping: resolution.mapping,
              anime: {
                id: resolution.mapping.scraperId,
                name: resolution.mapping.scraperName,
                episodes: resolution.mapping.episodes,
                catalogProvider: resolution.mapping.catalogProvider,
              },
            });
            return;
          }
          if (resolution.candidates.length) {
            setTarget(null);
            setCandidateDialog({
              media: item,
              query,
              items: resolution.candidates.slice(0, 8),
              loading: false,
              error: null,
            });
            return;
          }
        }
        setTarget(null);
        setMatchError(t("home.noMatchFound"));
      } catch (cause) {
        setTarget(null);
        setMatchError(
          cause instanceof Error ? cause.message : t("home.prepareFailed"),
        );
      } finally {
        setMatchLoading(false);
      }
    },
    [provider, translationType, t],
  );

  useEffect(() => {
    void window
      .aniPlay!.aniList.media.get(id)
      .then((item) => {
        showMedia(item);
        void preparePlaybackTarget(item);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : t("home.loadFailed")),
      );
  }, [id, preparePlaybackTarget, showMedia, t]);

  const save = async () => {
    if (!media) return;
    setSaving(true);
    setError(null);
    try {
      const input: ListUpdateInput = {
        mediaId: media.id,
        status,
        progress,
        score,
        repeat,
      };
      const listState = await window.aniPlay!.aniList.list.update(input);
      setMedia({ ...media, listState });
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("home.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!media?.listState) return;
    setSaving(true);
    try {
      await window.aniPlay!.aniList.list.delete(media.listState.id);
      setMedia({ ...media, listState: undefined });
      setStatus("PLANNING");
      setProgress(0);
      setScore(0);
      setRepeat(0);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("home.removeFailed"));
    } finally {
      setSaving(false);
    }
  };

  const openLinkedMedia = (item: AnimeSummary) => {
    if (onOpenLinkedMedia) {
      onOpenLinkedMedia(item);
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    setMedia(null);
    setError(null);
    void window
      .aniPlay!.aniList.media.get(item.id)
      .then((next) => {
        showMedia(next);
        void preparePlaybackTarget(next);
      })
      .catch(() => setError(t("home.linkedMediaFailed")));
  };

  const openCandidateSearch = async (query?: string) => {
    if (!media) return;
    const nextQuery = query ?? queryCandidates(media)[0] ?? media.title;
    setCandidateDialog({
      media,
      query: nextQuery,
      items: [],
      loading: true,
      error: null,
    });
    try {
      const items = await searchForCandidates(media, nextQuery);
      setCandidateDialog({
        media,
        query: nextQuery,
        items: items.slice(0, 8),
        loading: false,
        error: null,
      });
    } catch (cause) {
      setCandidateDialog({
        media,
        query: nextQuery,
        items: [],
        loading: false,
        error:
          cause instanceof Error ? cause.message : t("browse.searchFailed"),
      });
    }
  };

  const chooseCandidate = async (item: CatalogCandidate) => {
    if (!media) return;
    const mapping = await window.aniPlay!.aniList.mapping.confirm(
      media.id,
      item.anime,
      translationType,
    );
    setTarget({ anime: item.anime, mapping });
    setCandidateDialog(null);
    setMatchError(null);
  };

  const forgetMatch = async () => {
    if (!media) return;
    await window.aniPlay!.aniList.mapping.forget(media.id);
    setTarget(null);
    setMatchError(t("home.matchCleared"));
  };

  if (error && !media)
    return (
      <div className="home-empty">
        <button onClick={onBack} className="icon-button">
          <ChevronLeft />
        </button>
        <p className="mt-4 text-red-300">{error}</p>
      </div>
    );
  if (!media)
    return (
      <div className="home-loading">
        <Loader2 className="animate-spin" />
      </div>
    );

  return (
    <div className="home-details">
      <section className="home-details-hero">
        <div
          className="home-details-banner"
          style={
            media.bannerUrl
              ? { backgroundImage: `url(${media.bannerUrl})` }
              : { backgroundColor: media.accentColor }
          }
        />
        <div className="home-details-overlay" />
        <div className="home-details-content">
          <img
            src={media.coverUrl}
            alt=""
            className="home-details-cover"
          />
          <div className="home-details-main">
            <button
              onClick={onBack}
              className="home-details-back"
            >
              <ChevronLeft size={18} /> {t("anilistWorkspace.back")}
            </button>
            <h2 className="home-details-title">{media.title}</h2>
            <div className="home-details-meta">
              <span>{media.format}</span>
              <span>
                {media.season} {media.seasonYear}
              </span>
              <span>{media.status}</span>
              <span>
                {media.episodes
                  ? t("home.episodeCount", { count: media.episodes })
                  : "?"}
              </span>
              {media.averageScore ? <span>★ {media.averageScore}%</span> : null}
            </div>
          </div>
        </div>
      </section>
      {error ? (
        <p
          role="alert"
          className="home-alert home-alert--error"
        >
          {error}
        </p>
      ) : null}
      <div className="home-details-grid">
        <section className="space-y-4">
          <div className="home-playback">
            <div className="home-playback-header">
              <div>
                <h3 className="home-playback-title">{t("home.readyTitle")}</h3>
                <p className="home-playback-description">
                  {t("home.readyDescription", {
                    provider: providerLabel(provider),
                    mode:
                      translationType === "dub"
                        ? t("home.dubbed")
                        : t("home.subbed"),
                  })}
                </p>
              </div>
              <button
                disabled={!target || !suggestion}
                onClick={() =>
                  target &&
                  suggestion &&
                  onOpenAnime(media, target.anime, suggestion)
                }
                className="primary-action"
              >
                <Play size={17} /> {t("home.play")}
              </button>
            </div>
            <div className="home-playback-grid">
              <div className="home-playback-card">
                <p className="home-playback-card-label">
                  {t("home.episode")}
                </p>
                <p className="home-playback-card-value">
                  {t("downloads.episode", {
                    episode: suggestion?.episode ?? "1",
                  })}
                </p>
                <p className="home-playback-card-sub">
                  {suggestion?.label ?? t("home.startEpisode")}
                </p>
              </div>
              <div className="home-playback-card" style={{ gridColumn: "span 2" }}>
                <p className="home-playback-card-label">
                  {t("home.playbackMatch")}
                </p>
                {matchLoading ? (
                  <p className="home-playback-card-value flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />{" "}
                    {t("home.findingMatch")}
                  </p>
                ) : target ? (
                  <>
                    <p className="home-playback-card-value truncate">
                      {target.anime.name}
                    </p>
                    <p className="home-playback-card-sub">
                      {providerLabel(target.anime.catalogProvider)} ·{" "}
                      {target.anime.episodes
                        ? t("home.episodeCount", {
                            count: target.anime.episodes,
                          })
                        : "?"}
                    </p>
                  </>
                ) : (
                  <p className="home-playback-card-value">
                    {matchError ?? t("home.noMatch")}
                  </p>
                )}
              </div>
            </div>
            <div className="home-playback-actions">
              <button
                onClick={() => void openCandidateSearch()}
                className="home-playback-action"
              >
                <Search size={14} />{" "}
                {target ? t("home.changeMatch") : t("home.searchAgain")}
              </button>
              <button
                disabled={!target}
                onClick={() => void forgetMatch()}
                className="home-playback-action"
              >
                <RotateCcw size={14} />{" "}
                {t("home.forgetMatch")}
              </button>
            </div>
          </div>
          <div className="home-about">
            <h3 className="home-about-title">{t("home.about")}</h3>
            <p className="home-about-description">
              {media.description}
            </p>
            <div className="home-about-genres">
              {media.genres.map((genre) => (
                <span
                  key={genre}
                  className="home-about-genre"
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>
        </section>
        <aside className="home-anilist">
          <div className="home-anilist-header">
            <h3 className="home-anilist-title">
              <ListPlus size={18} /> {t("home.myAniList")}
            </h3>
            {media.listState && hasListChanges ? (
              <button
                type="button"
                disabled={saving}
                onClick={resetListDraft}
                className="home-anilist-reset"
              >
                {t("home.resetChanges")}
              </button>
            ) : null}
          </div>
          <div className="home-anilist-grid">
            <fieldset className="home-anilist-fieldset">
              <legend className="home-anilist-legend">
                {t("home.status")}
              </legend>
              <div className="home-anilist-statuses">
                {LIST_STATUSES.map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setStatus(item)}
                    aria-pressed={status === item}
                    className={`home-anilist-status ${status === item ? "active" : ""}`}
                  >
                    {t(`home.statuses.${item.toLowerCase()}`)}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="home-anilist-row">
              <NumberStepper
                label={t("home.progress")}
                value={progress}
                onChange={setProgress}
                max={media.episodes}
              />
              <NumberStepper
                label={t("home.repeats")}
                value={repeat}
                onChange={setRepeat}
              />
            </div>
            <label className="home-score">
              <span className="home-score-header">
                <span>{t("home.score")}</span>
                <strong className="home-score-value">
                  {score}
                </strong>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={score}
                onChange={(event) => setScore(Number(event.target.value))}
                className="home-score-input"
              />
            </label>
            <div className="home-anilist-actions">
              <button
                disabled={saving || !hasListChanges}
                onClick={() => void save()}
                className="home-anilist-save"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : null}{" "}
                {media.listState ? t("home.saveChanges") : t("home.addToList")}
              </button>
              {media.listState ? (
                <button
                  disabled={saving}
                  onClick={() => void remove()}
                  className="home-anilist-remove"
                >
                  {t("home.remove")}
                </button>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
      <RelationsSection
        items={media.relations}
        onSelect={openLinkedMedia}
        t={t}
      />
      <Section
        title={t("home.recommendations")}
        icon={<Sparkles size={18} className="home-section-header-icon" />}
        items={media.recommendations}
        onSelect={openLinkedMedia}
      />
      {candidateDialog ? (
        <CandidateModal
          key={`${candidateDialog.media.id}:${candidateDialog.query}`}
          dialog={candidateDialog}
          setDialog={setCandidateDialog}
          onRetry={(query) => void openCandidateSearch(query)}
          onChoose={(item) => void chooseCandidate(item)}
        />
      ) : null}
    </div>
  );
}

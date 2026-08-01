import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock3,
  Film,
  Gauge,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  AnimeSummary,
  AniListProfile,
  AniListSession,
} from "../anilist-types";
//import type { ProfileShareStyle } from "../profile-share-types";
import { AchievementsSection } from "../components/AchievementBrowser";
//import { createAchievements } from "../lib/profile-achievements";
import { EMPTY_VIEWING_SUMMARY, type ViewingSummary } from "../viewing-types";

interface ProfilePageProps {
  onOpenMedia: (media: AnimeSummary) => void;
}

interface ProfileSnapshot {
  session: AniListSession;
  profile: AniListProfile | null;
  viewingSummary: ViewingSummary;
  fetchedAt: number;
}

let profileSnapshot: ProfileSnapshot | null = null;
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

function StatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <article className="m3-card group p-5 transition-all hover:-translate-y-0.5 hover:border-m3-primary/30 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="absolute inset-0 bg-gradient-to-br from-m3-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="flex size-10 items-center justify-center rounded-2xl bg-m3-primary/10 text-m3-primary">
          {icon}
        </div>

        <span className="pt-1 text-right text-[10px] font-black uppercase tracking-[0.16em] text-m3-on-surface-variant">
          {label}
        </span>
      </div>

      <p className="mt-5 text-3xl font-black tracking-tight">
        {value}
      </p>

      {detail ? (
        <p className="mt-1 text-xs text-m3-on-surface-variant">
          {detail}
        </p>
      ) : null}
    </article>
  );
}

function FavouriteCard({
  media,
  onOpen,
}: {
  media: AnimeSummary;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="
        group relative aspect-[2/3]
        overflow-hidden rounded-2xl
        border border-m3-outline/15
        bg-m3-surface-container
        text-left
        transition-all
        hover:-translate-y-1
        hover:border-m3-primary/40
      "
    >
      {media.coverUrl ? (
        <img
          src={media.coverUrl}
          alt=""
          className="
            h-full w-full object-cover
            transition-transform duration-300
            group-hover:scale-110
          "
        />
      ) : (
        <div
          className="h-full w-full"
          style={{
            backgroundColor: media.accentColor,
          }}
        />
      )}

      <span
        className="
          absolute inset-x-0 bottom-0
          bg-gradient-to-t
          from-black/95
          via-black/60
          to-transparent
          px-3 pb-3 pt-12
        "
      >
        <strong className="block truncate text-sm font-black text-white">
          {media.title}
        </strong>

        <span className="mt-1 flex items-center gap-2 text-[11px] text-white/70">
          {media.format ?? "Anime"}

          {media.averageScore ? (
            <span>
              ★ {media.averageScore}%
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

export function ProfilePage({ onOpenMedia }: ProfilePageProps) {
  const { t, i18n } = useTranslation();
  const [session, setSession] = useState<AniListSession | null>(
    () => profileSnapshot?.session ?? null,
  );
  const [profile, setProfile] = useState<AniListProfile | null>(
    () => profileSnapshot?.profile ?? null,
  );
  const [loading, setLoading] = useState(() => profileSnapshot === null);
  const [authBusy, setAuthBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingSummary, setViewingSummary] = useState<ViewingSummary>(
    () => profileSnapshot?.viewingSummary ?? EMPTY_VIEWING_SUMMARY,
  );

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      if (!background) setError(null);
      try {
        const nextSession = await window.aniPlay!.aniList.auth.status();
        setSession(nextSession);
        if (nextSession.authenticated) {
          const [nextProfile, nextViewingSummary] = await Promise.all([
            window.aniPlay!.aniList.profile.get(),
            window.aniPlay!.viewing.getSummary(),
          ]);
          profileSnapshot = {
            session: nextSession,
            profile: nextProfile,
            viewingSummary: nextViewingSummary,
            fetchedAt: Date.now(),
          };
          setProfile(nextProfile);
          setViewingSummary(nextViewingSummary);
        } else {
          profileSnapshot = {
            session: nextSession,
            profile: null,
            viewingSummary: EMPTY_VIEWING_SUMMARY,
            fetchedAt: Date.now(),
          };
          setProfile(null);
          setViewingSummary(EMPTY_VIEWING_SUMMARY);
        }
      } catch (cause) {
        if (!background)
          setError(
            cause instanceof Error ? cause.message : t("profile.loadFailed"),
          );
      } finally {
        if (!background) setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    const snapshotIsStale =
      profileSnapshot !== null &&
      Date.now() - profileSnapshot.fetchedAt >= PROFILE_CACHE_TTL_MS;
    if (profileSnapshot !== null && !snapshotIsStale) return;
    const timer = window.setTimeout(
      () => void load(profileSnapshot !== null),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);

  const signIn = async () => {
    setAuthBusy(true);
    setError(null);
    try {
      await window.aniPlay!.aniList.auth.start();
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("profile.signInFailed"),
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    const nextSession = await window.aniPlay!.aniList.auth.logout();
    profileSnapshot = {
      session: nextSession,
      profile: null,
      viewingSummary: EMPTY_VIEWING_SUMMARY,
      fetchedAt: Date.now(),
    };
    setProfile(null);
    setViewingSummary(EMPTY_VIEWING_SUMMARY);
    setSession(nextSession);
  };

  const numberFormat = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );

  if (loading && !session)
    return (
      <div className="m3-card flex min-h-80 flex-1 items-center justify-center">
        <Loader2 className="animate-spin text-m3-primary" size={28} />
      </div>
    );

  if (!session?.authenticated || !profile)
    return (
      <div className="m3-card flex min-h-[520px] flex-1 flex-col items-center justify-center overflow-hidden p-8 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-m3-primary/15 text-m3-primary">
          <UserRound size={38} />
        </div>
        <p className="section-label mt-6">{t("profile.sectionLabel")}</p>
        <h1 className="mt-3 text-3xl font-black">
          {t("profile.signedOutTitle")}
        </h1>
        <p className="mt-2 max-w-lg text-sm leading-6 text-m3-on-surface-variant">
          {t("profile.signedOutBody")}
        </p>
        <button
          type="button"
          disabled={authBusy || !session?.configured}
          onClick={() => void signIn()}
          className="primary-action mt-6 px-5 py-3"
        >
          {authBusy ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <LogIn size={18} />
          )}{" "}
          {t("profile.signIn")}
        </button>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {error}
          </p>
        ) : null}
      </div>
    );

  const completed =
    profile.stats.statuses.find((item) => item.label === "COMPLETED")?.count ??
    0;
  const daysWatched = profile.stats.minutesWatched / 1440;
  const maxGenreCount = Math.max(
    ...profile.stats.genres.map((item) => item.count),
    1,
  );

  return (
    <div className="flex flex-1 flex-col gap-5">
      <section
        className="
          relative
          overflow-hidden
          rounded-3xl
          border
          border-m3-outline/20
          bg-m3-surface-container/70
          backdrop-blur-xl
          shadow-2xl
        "
      >
        <div
          className="
            absolute
            inset-x-10
            top-0
            h-px
            bg-m3-primary
            opacity-70
          "
        />

        {profile.user.bannerImage ? (
          <img
            src={profile.user.bannerImage}
            alt=""
            className="
              absolute
              inset-0
              h-full
              w-full
              object-cover
              opacity-40
            "
          />
        ) : (
          <div
            className="
              absolute
              inset-0
              bg-gradient-to-br
              from-m3-primary/30
              via-m3-surface-container
              to-transparent
            "
          />
        )}

        <div
          className="
            absolute
            inset-0
            bg-gradient-to-t
            from-m3-surface-container
            via-m3-surface-container/70
            to-transparent
          "
        />

        <div
          className="
            relative
            flex
            min-h-72
            flex-col
            justify-end
            gap-5
            p-6
            lg:flex-row
            lg:items-end
            lg:justify-between
          "
        >
          <div className="flex items-end gap-5">
            {profile.user.avatar ? (
              <img
                src={profile.user.avatar}
                alt=""
                className="
                  size-28
                  rounded-[2rem]
                  border-4
                  border-m3-surface-container
                  shadow-2xl
                  ring-4
                  ring-m3-primary/20
                  object-cover
                "
              />
            ) : (
              <div
                className="
                  flex
                  size-28
                  items-center
                  justify-center
                  rounded-[2rem]
                  bg-m3-primary
                  text-m3-on-primary
                  shadow-xl
                "
              >
                <UserRound size={44} />
              </div>
            )}

            <div>
              <p className="section-label">{t("profile.sectionLabel")}</p>

              <h1
                className="
                  mt-2
                  text-4xl
                  font-black
                  tracking-tight
                "
              >
                {profile.user.name}
              </h1>

              <p className="mt-2 text-sm text-m3-on-surface-variant">
                {t("profile.summary", {
                  count: profile.stats.count,
                  completed,
                })}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="icon-button"
              title={t("profile.refresh")}
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>

            <button
              type="button"
              onClick={() => void signOut()}
              className="icon-button"
              title={t("profile.signOut")}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <p
          role="alert"
          className="
            rounded-2xl
            border
            border-red-400/20
            bg-red-400/10
            px-4
            py-3
            text-sm
            text-red-300
          "
        >
          {error}
        </p>
      ) : null}

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Film size={21} />}
          label={t("profile.stats.anime")}
          value={numberFormat.format(profile.stats.count)}
          detail={t("profile.stats.completed", {
            count: completed,
          })}
        />

        <StatCard
          icon={<Sparkles size={21} />}
          label={t("profile.stats.episodes")}
          value={numberFormat.format(profile.stats.episodesWatched)}
        />

        <StatCard
          icon={<Clock3 size={21} />}
          label={t("profile.stats.time")}
          value={t("profile.stats.days", {
            count: Number(daysWatched.toFixed(1)),
          })}
          detail={t("profile.stats.hours", {
            count: numberFormat.format(
              Math.round(profile.stats.minutesWatched / 60),
            ),
          })}
        />

        <StatCard
          icon={<Gauge size={21} />}
          label={t("profile.stats.meanScore")}
          value={
            profile.stats.meanScore ? profile.stats.meanScore.toFixed(1) : "—"
          }
          detail={t("profile.stats.outOf100")}
        />
      </section>

      {/* Analytics */}
      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        {/* Taste DNA */}
        <section
          className="
            relative
            overflow-hidden
            rounded-3xl
            border
            border-m3-outline/20
            bg-m3-surface-container/70
            backdrop-blur-xl
            p-5
          "
        >
          <div
            className="
              absolute
              left-8
              right-8
              top-0
              h-px
              bg-m3-primary
              opacity-60
            "
          />

          <div className="flex items-center gap-2">
            <Star className="text-m3-primary" size={20} />

            <h2 className="text-xl font-black">{t("profile.dna.title")}</h2>
          </div>

          <p className="mt-1 text-xs text-m3-on-surface-variant">
            {t("profile.dna.description")}
          </p>

          <div className="mt-6 space-y-4">
            {profile.stats.genres.length ? (
              profile.stats.genres.map((genre) => (
                <div key={genre.label}>
                  <div
                    className="
                      mb-2
                      flex
                      items-center
                      justify-between
                      text-xs
                    "
                  >
                    <span className="font-black uppercase tracking-wide">
                      {genre.label}
                    </span>

                    <span className="text-m3-on-surface-variant">
                      {t("profile.dna.titles", {
                        count: genre.count,
                      })}

                      {genre.meanScore
                        ? ` · ${genre.meanScore.toFixed(1)}`
                        : ""}
                    </span>
                  </div>

                  <div
                    className="
                      h-2
                      overflow-hidden
                      rounded-full
                      bg-m3-surface-variant/40
                    "
                  >
                    <div
                      className="
                        h-full
                        rounded-full
                        bg-gradient-to-r
                        from-m3-primary
                        to-[--custom-display-name-styles-main-color]
                        transition-all
                      "
                      style={{
                        width: `${Math.max(
                          4,
                          (genre.count / maxGenreCount) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-m3-on-surface-variant">
                {t("profile.dna.empty")}
              </p>
            )}
          </div>
        </section>

        {/* Achievements */}
        <AchievementsSection
          stats={profile.stats}
          facts={profile.achievementFacts}
          viewing={viewingSummary}
        />
      </div>

      {/* Favourites */}
      {profile.favourites.length ? (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Star className="text-m3-primary" size={20} />

            <h2 className="text-xl font-black">{t("profile.favourites")}</h2>
          </div>

          <div
            className="
              flex
              gap-3
              pb-2
              scrollbar-thin
            "
          >
            {profile.favourites.map((media) => (
              <FavouriteCard
                key={media.id}
                media={media}
                onOpen={() => onOpenMedia(media)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* About */}
      {profile.user.about ? (
        <section
          className="
            relative
            overflow-hidden
            rounded-3xl
            border
            border-m3-outline/20
            bg-m3-surface-container/70
            backdrop-blur-xl
            p-5
          "
        >
          <div
            className="
              absolute
              top-0
              left-10
              right-10
              h-px
              bg-m3-primary
              opacity-50
            "
          />

          <h2 className="text-xl font-black">{t("profile.about")}</h2>

          <p
            className="
              mt-3
              whitespace-pre-line
              text-sm
              leading-7
              text-m3-on-surface-variant
            "
          >
            {profile.user.about}
          </p>
        </section>
      ) : null}
    </div>
  );
}

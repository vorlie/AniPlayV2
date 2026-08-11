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
import { AchievementsSection } from "../components/feedback/AchievementBrowser";
import { IconButton } from "../components/ui/IconButton";
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
    <div className="profile-stat">
      <div className="profile-stat-icon">{icon}</div>

      <div className="profile-stat-content">
        <p className="profile-stat-value">{value}</p>
        <p className="profile-stat-label">{label}</p>

        {detail ? <p className="profile-stat-detail">{detail}</p> : null}
      </div>
    </div>
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
    <button type="button" onClick={onOpen} className="profile-favourite">
      <div className="profile-favourite-cover">
        {media.coverUrl ? (
          <img src={media.coverUrl} alt="" />
        ) : (
          <div
            className="profile-favourite-placeholder"
            style={{ backgroundColor: media.accentColor }}
          />
        )}
      </div>

      <div className="profile-favourite-overlay">
        <strong className="profile-favourite-title">{media.title}</strong>

        <span className="profile-favourite-meta">
          {media.format ?? "Anime"}

          {media.averageScore ? (
            <>
              <span className="profile-favourite-separator" />
              <span>★ {media.averageScore}%</span>
            </>
          ) : null}
        </span>
      </div>
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
        if (!background) {
          setError(
            cause instanceof Error ? cause.message : t("profile.loadFailed"),
          );
        }
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

  if (loading && !session) {
    return (
      <div className="profile-page profile-loading">
        <Loader2 className="profile-loading-icon" size={28} />
      </div>
    );
  }

  if (!session?.authenticated || !profile) {
    return (
      <div className="profile-page profile-signed-out">
        <div className="profile-empty-icon">
          <UserRound size={30} />
        </div>

        <p className="profile-eyebrow">{t("profile.sectionLabel")}</p>

        <h1 className="profile-empty-title">{t("profile.signedOutTitle")}</h1>

        <p className="profile-empty-text">{t("profile.signedOutBody")}</p>

        <button
          type="button"
          disabled={authBusy || !session?.configured}
          onClick={() => void signIn()}
          className="profile-sign-in"
        >
          {authBusy ? (
            <Loader2 className="profile-button-spinner" size={17} />
          ) : (
            <LogIn size={17} />
          )}

          {t("profile.signIn")}
        </button>

        {error ? (
          <p role="alert" className="profile-error profile-error-centered">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const completed =
    profile.stats.statuses.find((item) => item.label === "COMPLETED")?.count ??
    0;

  const daysWatched = profile.stats.minutesWatched / 1440;

  return (
    <div className="profile-page">
      {/* Profile identity */}
      <section className="profile-identity">
        <div className="profile-banner">
          {profile.user.bannerImage ? (
            <img src={profile.user.bannerImage} alt="" />
          ) : (
            <div className="profile-banner-fallback" />
          )}

          <div className="profile-banner-overlay" />
        </div>

        <div className="profile-identity-content">
          {profile.user.avatar ? (
            <img src={profile.user.avatar} alt="" className="profile-avatar" />
          ) : (
            <div className="profile-avatar profile-avatar-fallback">
              <UserRound size={38} />
            </div>
          )}

          <div className="profile-identity-text">
            <p className="profile-identity-label">AniList</p>

            <h2>{profile.user.name}</h2>

            <p>
              {t("profile.summary", {
                count: profile.stats.count,
                completed,
              })}
            </p>
          </div>
          <div className="profile-actions">
            <IconButton
              icon={RefreshCw}
              size={18}
              label={t("profile.refresh")}
              onClick={() => void load()}
              iconClassName={loading ? "profile-refresh-spinning" : ""}
            />

            <IconButton
              icon={LogOut}
              size={18}
              label={t("profile.signOut")}
              onClick={() => void signOut()}
            />
          </div>
        </div>
      </section>

      {error ? (
        <p role="alert" className="profile-error">
          {error}
        </p>
      ) : null}

      {/* Activity */}
      <section className="profile-section">
        <div className="profile-section-header">
          <div>
            
            <h2 className="profile-section-title"><Star size={17} />{t("profile.activityTitle")}</h2>
          </div>
        </div>

        <div className="profile-stats">
          <StatCard
            icon={<Film size={16} />}
            label={t("profile.stats.anime")}
            value={numberFormat.format(profile.stats.count)}
            detail={t("profile.stats.completed", {
              count: completed,
            })}
          />

          <StatCard
            icon={<Sparkles size={16} />}
            label={t("profile.stats.episodes")}
            value={numberFormat.format(profile.stats.episodesWatched)}
          />

          <StatCard
            icon={<Clock3 size={16} />}
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
            icon={<Gauge size={16} />}
            label={t("profile.stats.meanScore")}
            value={
              profile.stats.meanScore ? profile.stats.meanScore.toFixed(1) : "—"
            }
            detail={t("profile.stats.outOf100")}
          />
        </div>
      </section>

      {/* Favourites */}
      {profile.favourites.length ? (
        <section className="profile-section">
          <div className="profile-section-header">
            <div>
              <h2 className="profile-section-title">
                <Star size={17} />
                {t("profile.favourites")}
              </h2>
            </div>
          </div>

          <div className="profile-favourites">
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

      {/* Achievements */}
      <section className="profile-section profile-achievements">
        <AchievementsSection
          stats={profile.stats}
          facts={profile.achievementFacts}
          viewing={viewingSummary}
        />
      </section>
    </div>
  );
}

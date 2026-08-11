import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  Clock3,
  Compass,
  Film,
  LibraryBig,
  Lock,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AniListProfile } from "../../anilist-types";
import {
  createAchievements,
  type AchievementCategory,
  type ProfileAchievement,
} from "../../lib/profile-achievements";
import type { ViewingSummary } from "../../viewing-types";
import { IconButton } from "../ui/IconButton";

type AchievementFilter = "all" | "earned" | "locked";

function CategoryIcon({
  category,
  size = 17,
}: {
  category: AchievementCategory;
  size?: number;
}) {
  if (category === "episodes") return <Film size={size} />;
  if (category === "completed") return <CheckCircle2 size={size} />;
  if (category === "time") return <Clock3 size={size} />;
  if (category === "discovery") return <Compass size={size} />;
  if (category === "activity") return <Activity size={size} />;
  return <LibraryBig size={size} />;
}

function AchievementCard({
  achievement,
  compact = false,
}: {
  achievement: ProfileAchievement;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();

  const format = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        maximumFractionDigits:
          achievement.category === "time" ||
          achievement.category === "activity"
            ? 1
            : 0,
      }),
    [achievement.category, i18n.language],
  );

  const current = Math.min(achievement.target, achievement.current);

  const specialGoal = [
    "trendsetter",
    "hiddenGemHunter",
    "marathonRunner",
    "longRunningLegend",
    "shortAndSweet",
    "shounenRegular",
    "sliceOfLife",
    "fillerSkipper",
    "bingeMaster",
    "weekendWarrior",
    "nightOwl",
    "goldenWeek",
  ].includes(achievement.id);

  return (
    <article
      className={`achievement-card ${
        achievement.earned ? "achievement-card-earned" : ""
      } ${compact ? "achievement-card-compact" : ""}`}
    >
      <div className="achievement-icon">
        {achievement.earned ? (
          <Check size={17} />
        ) : (
          <CategoryIcon category={achievement.category} />
        )}
      </div>

      <div className="achievement-content">
        <div className="achievement-heading">
          <div className="achievement-copy">
            <p className="achievement-name">
              {t(`profile.achievements.items.${achievement.id}`)}
            </p>

            {!compact ? (
              <p className="achievement-description">
                {t(
                  specialGoal
                    ? `profile.achievements.specialGoals.${achievement.id}`
                    : `profile.achievements.goals.${achievement.category}`,
                  { target: achievement.target },
                )}
              </p>
            ) : null}
          </div>

          {achievement.earned ? (
            <span className="achievement-status">
              {t("profile.achievements.earned")}
            </span>
          ) : (
            <Lock
              className="achievement-lock"
              size={14}
              aria-label={t("profile.achievements.filters.locked")}
            />
          )}
        </div>

        <div className="achievement-progress">
          <div className="achievement-progress-track">
            <div
              className="achievement-progress-fill"
              style={{ width: `${achievement.progress}%` }}
            />
          </div>

          <span className="achievement-progress-value">
            {format.format(current)} / {format.format(achievement.target)}
          </span>
        </div>
      </div>
    </article>
  );
}

export function AchievementsSection({
  stats,
  facts,
  viewing,
}: {
  stats: AniListProfile["stats"];
  facts: AniListProfile["achievementFacts"];
  viewing: ViewingSummary;
}) {
  const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<AchievementFilter>("all");
  const [category, setCategory] = useState<AchievementCategory | "all">(
    "all",
  );

  const achievements = useMemo(
    () => createAchievements(stats, facts, viewing),
    [facts, stats, viewing],
  );

  const earned = achievements.filter(
    (item: ProfileAchievement) => item.earned,
  );

  const featured = [
    ...earned.slice(-2).reverse(),
    ...achievements
      .filter((item: ProfileAchievement) => !item.earned)
      .sort(
        (a: ProfileAchievement, b: ProfileAchievement) =>
          b.progress - a.progress,
      ),
  ].slice(0, 4);

  const visible = achievements.filter(
    (item: ProfileAchievement) =>
      (filter === "all" || (filter === "earned") === item.earned) &&
      (category === "all" || category === item.category),
  );

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <section className="achievements-section">
        <header className="achievements-section-header">
          <div>
            <div className="achievements-title-row">
              <Trophy size={17} />

              <h2>{t("profile.achievements.title")}</h2>
            </div>

            <p>
              {t("profile.achievements.summary", {
                earned: earned.length,
                total: achievements.length,
              })}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="achievements-browse"
          >
            {t("profile.achievements.browse")}
          </button>
        </header>

        <div className="achievements-featured">
          {featured.map((achievement) => (
            <AchievementCard
              key={achievement.id}
              achievement={achievement}
              compact
            />
          ))}
        </div>
      </section>

      {open ? (
        <div
          className="achievements-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="achievements-title"
            className="achievements-dialog"
          >
            <header className="achievements-dialog-header">
              <div>
                <p className="achievements-eyebrow">
                  <Sparkles size={12} />
                  {t("profile.achievements.collection")}
                </p>

                <h2 id="achievements-title">
                  {t("profile.achievements.browserTitle")}
                </h2>

                <p>
                  {t("profile.achievements.summary", {
                    earned: earned.length,
                    total: achievements.length,
                  })}
                </p>
              </div>

              <IconButton
                icon={X}
                size={18}
                label={t("profile.achievements.close")}
                onClick={() => setOpen(false)}
              />
            </header>

            <div className="achievements-toolbar">
              <div className="achievement-filter-group">
                {(["all", "earned", "locked"] as AchievementFilter[]).map(
                  (item) => (
                    <button
                      type="button"
                      key={item}
                      onClick={() => setFilter(item)}
                      aria-pressed={filter === item}
                      className={`achievement-filter ${
                        filter === item ? "active" : ""
                      }`}
                    >
                      {t(`profile.achievements.filters.${item}`)}
                    </button>
                  ),
                )}
              </div>

              <div className="achievement-category-group">
                {(
                  [
                    "all",
                    "library",
                    "episodes",
                    "completed",
                    "time",
                    "discovery",
                    "activity",
                  ] as const
                ).map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setCategory(item)}
                    aria-pressed={category === item}
                    className={`achievement-category ${
                      category === item ? "active" : ""
                    }`}
                  >
                    {item === "all" ? (
                      <Trophy size={13} />
                    ) : (
                      <CategoryIcon category={item} size={13} />
                    )}

                    {t(`profile.achievements.categories.${item}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="achievements-dialog-content">
              <div className="achievements-grid">
                {visible.map((achievement: ProfileAchievement) => (
                  <AchievementCard
                    key={achievement.id}
                    achievement={achievement}
                  />
                ))}
              </div>

              {visible.length === 0 ? (
                <div className="achievements-empty">
                  {t("profile.achievements.empty")}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
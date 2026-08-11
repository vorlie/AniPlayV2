import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { AnimeSummary } from "../../../anilist-types";

function episodeLabel(media: AnimeSummary, t: TFunction, fallback: string) {
  if (media.nextAiringEpisode) {
    return `Ep ${Math.max(1, media.nextAiringEpisode.episode - 1)}${media.episodes ? ` / ${media.episodes}` : ""}`;
  }
  return media.episodes ? t("home.episodeCount", { count: media.episodes }) : (media.format ?? fallback);
}

export interface AnimeCardProps {
  media: AnimeSummary;
  label?: string;
  onClick: () => void;
  progress?: number; // 0-100
}

export function AnimeCard({ media, label, onClick, progress }: AnimeCardProps) {
  const { t } = useTranslation();
  const fallback = t("home.animeFallback");

  return (
    <button
      type="button"
      onClick={onClick}
      className="anime-card"
    >
      <div className="anime-card-poster">
        {media.coverUrl ? (
          <img src={media.coverUrl} alt="" loading="lazy" />
        ) : (
          <div className="anime-card-fallback" style={{ backgroundColor: media.accentColor }} />
        )}
        {progress !== undefined && progress > 0 && (
          <div className="anime-card-progress">
            <div className="anime-card-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <div className="anime-card-content">
        <span className="anime-card-badge">
          {label ?? media.format ?? fallback}
        </span>
        <h4 className="anime-card-title">{media.title}</h4>
        <div className="anime-card-meta">
          <span className="anime-card-meta-item">
            {episodeLabel(media, t, fallback)}
          </span>
          {media.averageScore && (
            <span className="anime-card-meta-item">
              ★ {media.averageScore}%
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

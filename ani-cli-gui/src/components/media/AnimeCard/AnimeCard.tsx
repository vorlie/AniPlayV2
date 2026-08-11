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
}

export function AnimeCard({ media, label, onClick }: AnimeCardProps) {
  const { t } = useTranslation();
  const fallback = t("home.animeFallback");

  return (
    <button
      type="button"
      onClick={onClick}
      className="anime-list-card"
    >
      <div className="anime-list-card-poster">
        {media.coverUrl ? (
          <img src={media.coverUrl} alt="" loading="lazy" />
        ) : (
          <div className="anime-list-card-poster-fallback" style={{ backgroundColor: media.accentColor }} />
        )}
      </div>
      <div className="anime-list-card-content">
        <div>
          <span className="anime-list-card-label">
            {label ?? media.format ?? fallback}
          </span>
          <h4 className="anime-list-card-title">{media.title}</h4>
        </div>
        <div className="anime-list-card-meta">
          <span>{episodeLabel(media, t, fallback)}</span>
          {media.averageScore ? <span>★ {media.averageScore}%</span> : null}
        </div>
      </div>
    </button>
  );
}

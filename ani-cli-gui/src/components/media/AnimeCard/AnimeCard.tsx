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
      className="group flex h-32 overflow-hidden rounded-[24px] border border-m3-outline/10 bg-m3-surface-container/50 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-m3-primary/40 hover:bg-m3-surface-container"
    >
      <div className="w-22 shrink-0 bg-m3-surface-variant/20">
        {media.coverUrl ? (
          <img src={media.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full" style={{ backgroundColor: media.accentColor }} />
        )}
      </div>
      <div className="min-w-0 flex-1 p-3 flex flex-col justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-m3-primary">
            {label ?? media.format ?? fallback}
          </span>
          <h4 className="mt-1 line-clamp-2 text-sm font-black group-hover:text-m3-primary">{media.title}</h4>
        </div>
        <div className="flex gap-2 text-[11px] text-m3-on-surface-variant">
          <span>{episodeLabel(media, t, fallback)}</span>
          {media.averageScore ? <span>★ {media.averageScore}%</span> : null}
        </div>
      </div>
    </button>
  );
}

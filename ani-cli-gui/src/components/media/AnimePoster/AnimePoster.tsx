import { useTranslation } from "react-i18next";

import type { AnimeSummary } from "../../../anilist-types";

export interface AnimePosterProps {
  media: AnimeSummary;
  onClick: () => void;
}

export function AnimePoster({ media, onClick }: AnimePosterProps) {
  const { t } = useTranslation();
  const episode = media.nextAiringEpisode
    ? `Ep ${Math.max(1, media.nextAiringEpisode.episode - 1)}${media.episodes ? ` / ${media.episodes}` : ""}`
    : media.episodes ? t("home.episodeCount", { count: media.episodes }) : (media.format ?? t("home.animeFallback"));

  return (
    <button type="button" onClick={onClick} className="group min-w-0 text-left">
      <span className="relative block aspect-[2/3] overflow-hidden rounded-2xl border border-m3-outline/15 bg-m3-surface-variant/20">
        {media.coverUrl ? (
          <img src={media.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <span className="block h-full" style={{ backgroundColor: media.accentColor }} />
        )}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-2 pt-7 text-[10px] font-black text-white">{episode}</span>
      </span>
      <strong className="mt-2 block truncate text-xs group-hover:text-m3-primary">{media.title}</strong>
      <span className="mt-0.5 block truncate text-[10px] text-m3-on-surface-variant">
        {media.format ?? t("home.animeFallback")}{media.averageScore ? ` · ★ ${media.averageScore}%` : ""}
      </span>
    </button>
  );
}

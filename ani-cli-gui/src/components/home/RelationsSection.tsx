import { ListPlus } from "lucide-react";
import type { TFunction } from "i18next";
import { AnimeCard as AnimeCardNew } from "../media/AnimeCard";
import type { AnimeRelation, AnimeSummary } from "../../anilist-types";

interface RelationsSectionProps {
  items: AnimeRelation[];
  onSelect: (item: AnimeSummary) => void;
  t: TFunction;
}

export function RelationsSection({
  items,
  onSelect,
  t,
}: RelationsSectionProps) {
  if (!items.length) return null;
  return (
    <section className="home-section">
      <div className="home-section-header">
        <div className="flex items-center gap-2">
          <ListPlus size={18} className="home-section-header-icon" />
          <h2>{t("home.relations")}</h2>
        </div>
      </div>
      <div className="home-collection">
        {items.map((item) => (
          <AnimeCardNew
            key={`${item.relationType}:${item.media.id}`}
            media={item.media}
            label={t(`home.relationTypes.${item.relationType.toLowerCase()}`)}
            onClick={() => onSelect(item.media)}
          />
        ))}
      </div>
    </section>
  );
}

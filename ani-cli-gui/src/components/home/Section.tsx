import { AnimeCard as AnimeCardNew } from "../media/AnimeCard";
import type { AnimeSummary } from "../../anilist-types";

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  items: AnimeSummary[];
  onSelect: (item: AnimeSummary) => void;
  label?: string;
}

export function Section({
  title,
  icon,
  items,
  onSelect,
  label,
}: SectionProps) {
  if (!items.length) return null;
  return (
    <section className="home-section">
      <div className="home-section-header">
        <div className="flex items-center gap-2">
          {icon}
          <h2>{title}</h2>
        </div>
      </div>
      <div className="home-collection">
        {items.map((item) => (
          <AnimeCardNew
            key={item.id}
            media={item}
            label={label}
            onClick={() => onSelect(item)}
          />
        ))}
      </div>
    </section>
  );
}

import { Search } from "lucide-react";
import { AnimeCard as AnimeCardNew } from "../media/AnimeCard";
import type { AnimeSummary } from "../../anilist-types";

interface CollectionGridProps {
  items: AnimeSummary[];
  onSelect: (item: AnimeSummary) => void;
  empty: string;
}

export function CollectionGrid({
  items,
  onSelect,
  empty,
}: CollectionGridProps) {
  if (!items.length)
    return (
      <div className="home-collection-empty">
        <div className="home-collection-empty-icon">
          <Search size={20} />
        </div>
        <h3>{empty}</h3>
      </div>
    );
  return (
    <div className="home-collection">
      {items.map((item) => (
        <AnimeCardNew key={item.id} media={item} onClick={() => onSelect(item)} />
      ))}
    </div>
  );
}

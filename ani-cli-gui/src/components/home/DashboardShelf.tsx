import { useState } from "react";
import { AnimePoster } from "../media/AnimePoster";
import type { AnimeSummary } from "../../anilist-types";

interface ShelfTab {
  id: string;
  label: string;
  items: AnimeSummary[];
}

interface DashboardShelfProps {
  title: string;
  icon: React.ReactNode;
  tabs: ShelfTab[];
  onSelect: (item: AnimeSummary) => void;
}

export function DashboardShelf({
  title,
  icon,
  tabs,
  onSelect,
}: DashboardShelfProps) {
  const availableTabs = tabs.filter((tab) => tab.items.length);
  const [activeTab, setActiveTab] = useState(availableTabs[0]?.id ?? "");
  if (!availableTabs.length) return null;
  const selected =
    availableTabs.find((tab) => tab.id === activeTab) ?? availableTabs[0];
  return (
    <section className="home-shelf">
      <div className="home-shelf-header">
        <h3 className="home-shelf-title">
          {icon}
          {title}
        </h3>
        <div
          className="home-shelf-tabs"
          role="tablist"
          aria-label={title}
        >
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected.id === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`home-shelf-tab ${selected.id === tab.id ? "active" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="home-shelf-grid">
        {selected.items.slice(0, 6).map((item) => (
          <AnimePoster
            key={item.id}
            media={item}
            onClick={() => onSelect(item)}
          />
        ))}
      </div>
    </section>
  );
}

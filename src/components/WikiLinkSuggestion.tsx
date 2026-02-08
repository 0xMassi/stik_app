import type { WikiLinkItem } from "@/extensions/wiki-link";

interface WikiLinkSuggestionProps {
  items: WikiLinkItem[];
  selectedIndex: number;
  onSelect: (item: WikiLinkItem) => void;
}

export default function WikiLinkSuggestion({
  items,
  selectedIndex,
  onSelect,
}: WikiLinkSuggestionProps) {
  if (!items.length) {
    return (
      <div className="wiki-link-suggestion">
        <div className="wiki-link-suggestion-empty">No notes found</div>
      </div>
    );
  }

  return (
    <div className="wiki-link-suggestion">
      {items.map((item, index) => (
        <button
          key={item.path}
          className={`wiki-link-suggestion-item${
            index === selectedIndex ? " is-selected" : ""
          }`}
          onClick={() => onSelect(item)}
        >
          <span className="wiki-link-suggestion-slug">{item.slug}</span>
          <span className="wiki-link-suggestion-folder">{item.folder}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Suggestion popup renderer for wiki-links.
 * Creates a floating DOM element, renders WikiLinkSuggestion component into it.
 */

import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import WikiLinkSuggestion from "@/components/WikiLinkSuggestion";
import type { WikiLinkItem } from "./wiki-link";

export function renderWikiLinkSuggestion() {
  let root: Root | null = null;
  let container: HTMLElement | null = null;
  let selectedIndex = 0;
  let currentItems: WikiLinkItem[] = [];
  let currentCommand: SuggestionProps<WikiLinkItem>["command"] | null = null;

  function mount(props: SuggestionProps<WikiLinkItem>) {
    container = document.createElement("div");
    container.className = "wiki-link-suggestion-portal";
    document.body.appendChild(container);
    root = createRoot(container);
    selectedIndex = 0;
    render(props);
  }

  function render(props: SuggestionProps<WikiLinkItem>) {
    currentItems = props.items;
    currentCommand = props.command;

    if (!root || !container) return;

    // Position the popup below the cursor
    const rect = props.clientRect?.();
    if (rect) {
      container.style.position = "fixed";
      container.style.left = `${rect.left}px`;
      container.style.top = `${rect.bottom + 4}px`;
      container.style.zIndex = "300";
    }

    root.render(
      createElement(WikiLinkSuggestion, {
        items: props.items,
        selectedIndex,
        onSelect: (item: WikiLinkItem) => props.command(item),
      })
    );
  }

  function unmount() {
    root?.unmount();
    container?.remove();
    root = null;
    container = null;
    selectedIndex = 0;
    currentItems = [];
    currentCommand = null;
  }

  return {
    onStart(props: SuggestionProps<WikiLinkItem>) {
      mount(props);
    },
    onUpdate(props: SuggestionProps<WikiLinkItem>) {
      selectedIndex = Math.min(selectedIndex, Math.max(0, props.items.length - 1));
      render(props);
    },
    onExit() {
      unmount();
    },
    onKeyDown({ event }: SuggestionKeyDownProps) {
      if (event.key === "ArrowDown") {
        selectedIndex = Math.min(selectedIndex + 1, currentItems.length - 1);
        rerender();
        return true;
      }
      if (event.key === "ArrowUp") {
        selectedIndex = Math.max(selectedIndex - 1, 0);
        rerender();
        return true;
      }
      if (event.key === "Enter") {
        const item = currentItems[selectedIndex];
        if (item && currentCommand) {
          currentCommand(item);
        }
        return true;
      }
      if (event.key === "Escape") {
        return true; // let suggestion plugin handle dismiss
      }
      return false;
    },
  };

  function rerender() {
    if (!root || !container || !currentCommand) return;
    root.render(
      createElement(WikiLinkSuggestion, {
        items: currentItems,
        selectedIndex,
        onSelect: (item: WikiLinkItem) => currentCommand!(item),
      })
    );
  }
}

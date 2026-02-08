/**
 * Collapsible Headings for Stik — click chevron to fold/unfold.
 *
 * Purely visual: markdown on disk is never modified.
 * Fold state lives in ProseMirror plugin state and resets on note reopen.
 *
 * Fold scope: H1 folds until next H1, H2 until next H1/H2, H3 until next H1/H2/H3.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

const COLLAPSE_KEY = new PluginKey("collapsibleHeadings");

interface CollapseState {
  /** Set of heading node positions that are collapsed */
  collapsed: Set<number>;
}

/** Check if nodeB's heading level should stop a fold started at `foldLevel` */
function shouldStopFold(foldLevel: number, nodeLevel: number): boolean {
  return nodeLevel <= foldLevel;
}

/** Build decorations: chevrons on every heading + hide class on collapsed content */
function buildDecorations(
  doc: ProseMirrorNode,
  collapsed: Set<number>
): DecorationSet {
  const decorations: Decoration[] = [];

  doc.forEach((node, offset) => {
    if (node.type.name !== "heading") return;

    const level = node.attrs.level as number;
    const isCollapsed = collapsed.has(offset);

    // Chevron widget inside heading (offset+1 = inside the block, before text content)
    const chevron = Decoration.widget(offset + 1, (view) => {
      const btn = document.createElement("span");
      btn.className = `heading-fold-toggle${isCollapsed ? " collapsed" : ""}`;
      btn.setAttribute("data-heading-level", String(level));
      btn.setAttribute("role", "button");
      btn.setAttribute("aria-label", isCollapsed ? "Expand section" : "Collapse section");
      btn.textContent = "\u25B6"; // right-pointing triangle
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tr = view.state.tr.setMeta(COLLAPSE_KEY, { toggle: offset });
        view.dispatch(tr);
      });
      return btn;
    }, { side: -1 });
    decorations.push(chevron);
  });

  // Hide nodes that fall within a collapsed heading's scope
  const collapsedArray = Array.from(collapsed).sort((a, b) => a - b);

  for (const headingPos of collapsedArray) {
    const headingNode = doc.nodeAt(headingPos);
    if (!headingNode || headingNode.type.name !== "heading") continue;

    const foldLevel = headingNode.attrs.level as number;
    let hiding = false;

    doc.forEach((node, offset) => {
      if (offset === headingPos) {
        hiding = true;
        return; // skip the heading itself
      }

      if (!hiding) return;

      // Stop hiding at same-or-higher-level heading
      if (node.type.name === "heading") {
        const nodeLevel = node.attrs.level as number;
        if (shouldStopFold(foldLevel, nodeLevel)) {
          hiding = false;
          return;
        }
      }

      decorations.push(
        Decoration.node(offset, offset + node.nodeSize, {
          class: "heading-collapsed-content",
        })
      );
    });
  }

  return DecorationSet.create(doc, decorations);
}

export const CollapsibleHeadings = Extension.create({
  name: "collapsibleHeadings",

  addProseMirrorPlugins() {
    return [
      new Plugin<CollapseState>({
        key: COLLAPSE_KEY,

        state: {
          init(): CollapseState {
            return { collapsed: new Set() };
          },
          apply(tr, value): CollapseState {
            const meta = tr.getMeta(COLLAPSE_KEY) as
              | { toggle: number }
              | undefined;

            if (meta) {
              const next = new Set(value.collapsed);
              if (next.has(meta.toggle)) {
                next.delete(meta.toggle);
              } else {
                next.add(meta.toggle);
              }
              return { collapsed: next };
            }

            // Remap positions on doc changes
            if (tr.docChanged) {
              const next = new Set<number>();
              for (const pos of value.collapsed) {
                const mapped = tr.mapping.map(pos);
                // Verify the mapped position still points to a heading
                const node = tr.doc.nodeAt(mapped);
                if (node?.type.name === "heading") {
                  next.add(mapped);
                }
              }
              return { collapsed: next };
            }

            return value;
          },
        },

        props: {
          decorations(state) {
            const pluginState = COLLAPSE_KEY.getState(state) as CollapseState;
            return buildDecorations(state.doc, pluginState.collapsed);
          },
        },
      }),
    ];
  },
});

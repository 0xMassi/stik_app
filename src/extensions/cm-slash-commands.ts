/**
 * Slash commands for CodeMirror — Notion/Raycast-style "/" templates.
 *
 * Type "/" at line start (or after whitespace) to trigger a dropdown of
 * markdown templates. Picks insert the template and position the cursor.
 * Uses CM6's built-in autocomplete system — no new dependencies.
 */

import {
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import type { CustomTemplate } from "@/types";

interface SlashTemplate {
  command: string;
  badge: string;
  boost: number;
  insert: () => { text: string; cursor: number | [number, number] };
}

/** Built-in command names — used for validation (no duplicates with custom). */
export const BUILTIN_COMMAND_NAMES: readonly string[] = [
  "h1", "h2", "h3", "list", "numbered", "todo",
  "divider", "code", "quote", "table", "link", "image",
  "meeting", "standup", "journal", "brainstorm", "retro", "proscons", "weekly",
];

/** Returns all active slash command names (built-in + custom). */
export function getSlashCommandNames(): string[] {
  return [
    ...BUILTIN_COMMAND_NAMES,
    ...customTemplates.map((t) => t.command),
  ];
}

/** Resolve dynamic placeholders in template text at insertion time. */
function resolvePlaceholders(text: string): string {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = now.toLocaleDateString("en-US", { weekday: "long" });
  const isodate = now.toISOString().slice(0, 10);

  return text
    .replace(/\{\{datetime\}\}/g, `${date} ${time}`)
    .replace(/\{\{isodate\}\}/g, isodate)
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{time\}\}/g, time)
    .replace(/\{\{day\}\}/g, day);
}

// ── Custom templates (set at runtime from settings) ────────────────

let customTemplates: SlashTemplate[] = [];

/** Convert user-defined templates into SlashTemplates with {{cursor}} support. */
export function setCustomTemplates(templates: CustomTemplate[]): void {
  customTemplates = templates.map((t) => ({
    command: t.name,
    badge: "Custom",
    boost: -1,
    insert: () => {
      const resolved = resolvePlaceholders(t.body);
      const idx = resolved.indexOf("{{cursor}}");
      if (idx >= 0) {
        return { text: resolved.replace("{{cursor}}", ""), cursor: idx };
      }
      return { text: resolved, cursor: resolved.length };
    },
  }));
}

// ── Built-in templates ─────────────────────────────────────────────

const BUILTIN_TEMPLATES: SlashTemplate[] = [
  {
    command: "h1",
    badge: "Heading",
    boost: 0,
    insert: () => ({ text: "# ", cursor: 2 }),
  },
  {
    command: "h2",
    badge: "Heading",
    boost: 0,
    insert: () => ({ text: "## ", cursor: 3 }),
  },
  {
    command: "h3",
    badge: "Heading",
    boost: 0,
    insert: () => ({ text: "### ", cursor: 4 }),
  },
  {
    command: "list",
    badge: "List",
    boost: 0,
    insert: () => ({ text: "- \n- \n- ", cursor: 2 }),
  },
  {
    command: "numbered",
    badge: "List",
    boost: 0,
    insert: () => ({ text: "1. \n2. \n3. ", cursor: 3 }),
  },
  {
    command: "todo",
    badge: "Tasks",
    boost: 0,
    insert: () => ({ text: "- [ ] \n- [ ] \n- [ ] ", cursor: 6 }),
  },
  {
    command: "divider",
    badge: "---",
    boost: 0,
    insert: () => ({ text: "---\n", cursor: 4 }),
  },
  {
    command: "code",
    badge: "Code",
    boost: 0,
    insert: () => ({ text: "```\n\n```", cursor: 4 }),
  },
  {
    command: "quote",
    badge: "Quote",
    boost: 0,
    insert: () => ({ text: "> ", cursor: 2 }),
  },
  {
    command: "table",
    badge: "Table",
    boost: 0,
    insert: () => ({
      text: "| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n\n",
      cursor: 38, // inside first data cell (after "| ")
    }),
  },
  {
    command: "link",
    badge: "Link",
    boost: 0,
    insert: () => ({ text: "[text](url)", cursor: [1, 5] }),
  },
  {
    command: "image",
    badge: "Image",
    boost: 0,
    insert: () => ({ text: "![alt](url)", cursor: [2, 5] }),
  },

  // ── Note templates ──────────────────────────────────────────────
  {
    command: "meeting",
    badge: "Template",
    boost: -1,
    insert: () => {
      const text = resolvePlaceholders(
        "# Meeting — {{date}}\n\nAttendees: \n\n## Agenda\n\n- \n\n## Notes\n\n- \n\n## Action Items\n\n- [ ] "
      );
      const anchor = "Attendees: ";
      return { text, cursor: text.indexOf(anchor) + anchor.length };
    },
  },
  {
    command: "standup",
    badge: "Template",
    boost: -1,
    insert: () => {
      const text = resolvePlaceholders(
        "# Standup — {{day}}, {{date}}\n\n## Yesterday\n\n- \n\n## Today\n\n- \n\n## Blockers\n\n- "
      );
      const anchor = "## Yesterday\n\n- ";
      return { text, cursor: text.indexOf(anchor) + anchor.length };
    },
  },
  {
    command: "journal",
    badge: "Template",
    boost: -1,
    insert: () => {
      const text = resolvePlaceholders(
        "# {{day}}, {{date}}\n\n## Grateful for\n\n- \n\n## On my mind\n\n- \n\n## Today's wins\n\n- \n\n"
      );
      return { text, cursor: text.length };
    },
  },
  {
    command: "brainstorm",
    badge: "Template",
    boost: -1,
    insert: () => {
      const text = "# Brainstorm: \n\n## Ideas\n\n- \n\n## Favorites\n\n- \n\n## Next Steps\n\n- ";
      const anchor = "# Brainstorm: ";
      return { text, cursor: text.indexOf(anchor) + anchor.length };
    },
  },
  {
    command: "retro",
    badge: "Template",
    boost: -1,
    insert: () => {
      const text = resolvePlaceholders(
        "# Retro — {{date}}\n\n## Went well\n\n- \n\n## Could improve\n\n- \n\n## Action items\n\n- [ ] "
      );
      const anchor = "## Went well\n\n- ";
      return { text, cursor: text.indexOf(anchor) + anchor.length };
    },
  },
  {
    command: "proscons",
    badge: "Template",
    boost: -1,
    insert: () => {
      const text = "# Decision: \n\n## Pros\n\n- \n\n## Cons\n\n- \n\n## Verdict\n\n";
      const anchor = "# Decision: ";
      return { text, cursor: text.indexOf(anchor) + anchor.length };
    },
  },
  {
    command: "weekly",
    badge: "Template",
    boost: -1,
    insert: () => {
      const text = resolvePlaceholders(
        "# Week of {{date}}\n\n## Goals\n\n- [ ] \n- [ ] \n- [ ] \n\n## Progress\n\n- \n\n## Reflections\n\n"
      );
      const anchor = "## Goals\n\n- [ ] ";
      return { text, cursor: text.indexOf(anchor) + anchor.length };
    },
  },
];

/**
 * CompletionSource for slash commands.
 * Triggers when "/" appears at line start or after only whitespace.
 */
export function slashCommandCompletionSource(
  context: CompletionContext
): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // Match "/" preceded by nothing or whitespace only
  const match = textBefore.match(/^(\s*)\//);
  if (!match) return null;

  const slashPos = line.from + match[1].length; // position of the "/"
  const typed = textBefore.slice(match[1].length + 1); // chars after "/"

  const allTemplates = [...BUILTIN_TEMPLATES, ...customTemplates];

  // Filter templates by typed prefix
  const filtered = allTemplates.filter((t) =>
    t.command.startsWith(typed.toLowerCase())
  );
  if (!filtered.length) return null;

  const options: Completion[] = filtered.map((t) => ({
    label: `/${t.command}`,
    detail: t.badge,
    boost: t.boost,
    apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
      const { text, cursor } = t.insert();
      const changes = { from, to, insert: text };

      if (Array.isArray(cursor)) {
        // Selection range (e.g. select "text" in [text](url))
        view.dispatch({
          changes,
          selection: { anchor: from + cursor[0], head: from + cursor[1] },
        });
      } else {
        view.dispatch({
          changes,
          selection: { anchor: from + cursor },
        });
      }
    },
  }));

  return {
    from: slashPos,
    to: context.pos,
    options,
    filter: false, // we handle filtering ourselves
  };
}

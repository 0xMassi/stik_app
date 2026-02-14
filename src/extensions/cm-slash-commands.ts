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

interface SlashTemplate {
  command: string;
  badge: string;
  insert: () => { text: string; cursor: number | [number, number] };
}

/** Exported for external consumers (e.g. folder picker disambiguation). */
export const SLASH_COMMAND_NAMES: readonly string[] = [
  "h1", "h2", "h3", "list", "numbered", "todo",
  "divider", "code", "quote", "table", "link", "image",
];

const SLASH_TEMPLATES: SlashTemplate[] = [
  {
    command: "h1",
    badge: "Heading",
    insert: () => ({ text: "# ", cursor: 2 }),
  },
  {
    command: "h2",
    badge: "Heading",
    insert: () => ({ text: "## ", cursor: 3 }),
  },
  {
    command: "h3",
    badge: "Heading",
    insert: () => ({ text: "### ", cursor: 4 }),
  },
  {
    command: "list",
    badge: "List",
    insert: () => ({ text: "- \n- \n- ", cursor: 2 }),
  },
  {
    command: "numbered",
    badge: "List",
    insert: () => ({ text: "1. \n2. \n3. ", cursor: 3 }),
  },
  {
    command: "todo",
    badge: "Tasks",
    insert: () => ({ text: "- [ ] \n- [ ] \n- [ ] ", cursor: 6 }),
  },
  {
    command: "divider",
    badge: "---",
    insert: () => ({ text: "---\n", cursor: 4 }),
  },
  {
    command: "code",
    badge: "Code",
    insert: () => ({ text: "```\n\n```", cursor: 4 }),
  },
  {
    command: "quote",
    badge: "Quote",
    insert: () => ({ text: "> ", cursor: 2 }),
  },
  {
    command: "table",
    badge: "Table",
    insert: () => ({
      text: "| Column 1 | Column 2 |\n| --- | --- |\n|  |  |",
      cursor: 38, // inside first data cell (after "| ")
    }),
  },
  {
    command: "link",
    badge: "Link",
    insert: () => ({ text: "[text](url)", cursor: [1, 5] }),
  },
  {
    command: "image",
    badge: "Image",
    insert: () => ({ text: "![alt](url)", cursor: [2, 5] }),
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

  // Filter templates by typed prefix
  const filtered = SLASH_TEMPLATES.filter((t) =>
    t.command.startsWith(typed.toLowerCase())
  );
  if (!filtered.length) return null;

  const options: Completion[] = filtered.map((t) => ({
    label: `/${t.command}`,
    detail: t.badge,
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

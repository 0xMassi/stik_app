/**
 * Fixes task list creation when typing `- [ ] `.
 *
 * BulletList fires on `- `, creating a bullet item. When the user then types
 * `[ ]` + space, this plugin intercepts the space, detects the pattern, and
 * replaces the whole bulletList with a fresh taskList in one dispatch.
 */

import { Extension } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";

export const TaskListInputFix = Extension.create({
  name: "taskListInputFix",

  addProseMirrorPlugins() {
    const { schema } = this.editor;
    const taskListType = schema.nodes.taskList;
    const taskItemType = schema.nodes.taskItem;
    const bulletListType = schema.nodes.bulletList;

    if (!taskListType || !taskItemType) return [];

    return [
      new Plugin({
        props: {
          handleTextInput(view, from, _to, text) {
            if (text !== " ") return false;

            const { state } = view;
            const $from = state.doc.resolve(from);
            const textBefore = state.doc.textBetween($from.start(), from);

            // Match `[ ]` or `[x]` as the entire text block content
            const match = textBefore.match(/^\[( |x)?\]$/);
            if (!match) return false;

            const checked = match[1] === "x";

            // Find bulletList ancestor
            let bulletListPos = -1;
            let bulletListNode = null;
            for (let d = $from.depth; d > 0; d--) {
              if ($from.node(d).type === bulletListType) {
                bulletListPos = $from.before(d);
                bulletListNode = $from.node(d);
                break;
              }
            }

            if (!bulletListNode || bulletListPos === -1) return false;

            // Replace entire bulletList with a new taskList
            const taskItem = taskItemType.create(
              { checked },
              schema.nodes.paragraph.create()
            );
            const taskList = taskListType.create(null, taskItem);
            const tr = state.tr.replaceWith(
              bulletListPos,
              bulletListPos + bulletListNode.nodeSize,
              taskList
            );
            // Cursor: taskList(+1) > taskItem(+1) > paragraph(+1) = +3
            tr.setSelection(
              TextSelection.near(tr.doc.resolve(bulletListPos + 3))
            );
            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});

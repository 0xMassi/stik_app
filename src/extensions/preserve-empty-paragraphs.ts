import type { Editor } from "@tiptap/core";

type MarkdownSerializerState = {
  write: (text: string) => void;
  closeBlock: (node: unknown) => void;
  renderInline: (node: unknown) => void;
};

type ParagraphNode = {
  childCount: number;
};

export function installParagraphMarkdownSerializer(editor: Editor): void {
  const paragraphExt = editor.extensionManager.extensions.find(
    (extension) => extension.name === "paragraph"
  );
  if (!paragraphExt) return;

  const existingMarkdownSpec =
    (paragraphExt.storage?.markdown as Record<string, unknown> | undefined) ?? {};

  paragraphExt.storage = paragraphExt.storage ?? {};
  paragraphExt.storage.markdown = {
    ...existingMarkdownSpec,
    // Persist visual blank rows by serializing empty paragraphs as HTML line breaks.
    serialize: (state: MarkdownSerializerState, node: ParagraphNode) => {
      if (node.childCount === 0) {
        state.write("<br>");
        state.closeBlock(node);
        return;
      }

      state.renderInline(node);
      state.closeBlock(node);
    },
  };
}

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { installParagraphMarkdownSerializer } from "./preserve-empty-paragraphs";

function createEditor(content = "") {
  return new Editor({
    extensions: [
      StarterKit,
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
    ],
    content,
  });
}

describe("preserve empty paragraphs in markdown", () => {
  it("serializes empty paragraphs as <br> markers", () => {
    const editor = createEditor("");
    installParagraphMarkdownSerializer(editor);

    editor.commands.setContent("<p>text</p><p></p><p>text</p><p></p><p>text</p>", false);
    const markdown = editor.storage.markdown.getMarkdown();

    expect(markdown).toBe("text\n\n<br>\n\ntext\n\n<br>\n\ntext");
    editor.destroy();
  });

  it("round-trips empty rows when reopening markdown", () => {
    const source = createEditor("");
    installParagraphMarkdownSerializer(source);
    source.commands.setContent("<p>first</p><p></p><p>second</p>", false);
    const markdown = source.storage.markdown.getMarkdown();
    source.destroy();

    const reopened = createEditor("");
    installParagraphMarkdownSerializer(reopened);
    reopened.commands.setContent(markdown, false);

    expect(reopened.getHTML()).toBe("<p>first</p><p><br></p><p>second</p>");
    reopened.destroy();
  });
});

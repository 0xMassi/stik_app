import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { StikHighlight } from "./highlight";

function createEditor(content = "") {
  return new Editor({
    extensions: [
      StarterKit,
      StikHighlight,
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
    ],
    content,
  });
}

describe("StikHighlight", () => {
  it("is registered as an extension", () => {
    const editor = createEditor();
    const ext = editor.extensionManager.extensions.find((e) => e.name === "highlight");
    expect(ext).toBeDefined();
    editor.destroy();
  });

  it("has inclusive: false to prevent sticky formatting", () => {
    const editor = createEditor();
    const markType = editor.schema.marks.highlight;
    expect(markType).toBeDefined();
    expect(markType.spec.inclusive).toBe(false);
    editor.destroy();
  });

  it("serializes <mark> to ==text== markdown", () => {
    const editor = createEditor("<p>hello <mark>world</mark> end</p>");
    const md = editor.storage.markdown.getMarkdown();
    expect(md).toContain("==world==");
    expect(md).toContain("hello");
    expect(md).toContain("end");
    editor.destroy();
  });

  it("parses ==text== markdown to <mark>", () => {
    const editor = createEditor("");
    editor.commands.setContent("hello ==highlighted== end");
    const html = editor.getHTML();
    expect(html).toContain("<mark>");
    expect(html).toContain("highlighted");
    editor.destroy();
  });

  it("roundtrips markdown → HTML → markdown", () => {
    const input = "some ==important== text";
    const editor = createEditor("");
    editor.commands.setContent(input);
    const md = editor.storage.markdown.getMarkdown();
    expect(md).toContain("==important==");
    editor.destroy();
  });

  it("handles multiple highlights in one line", () => {
    const editor = createEditor("");
    editor.commands.setContent("==first== normal ==second==");
    const md = editor.storage.markdown.getMarkdown();
    expect(md).toContain("==first==");
    expect(md).toContain("==second==");
    editor.destroy();
  });
});

import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { WikiLink } from "./wiki-link";

function createEditor(content = "") {
  return new Editor({
    extensions: [
      StarterKit,
      WikiLink.configure({
        suggestion: { char: "[[", items: async () => [] },
      }),
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
    ],
    content,
  });
}

describe("WikiLink markdown roundtrip", () => {
  it("serializes wiki-link node to [[slug]] markdown", () => {
    const editor = createEditor("");
    editor.commands.insertContent([
      { type: "paragraph", content: [
        { type: "text", text: "see " },
        { type: "wikiLink", attrs: { slug: "my-note", path: "/path/to/my-note.md" } },
        { type: "text", text: " for details" },
      ]},
    ]);
    const md = editor.storage.markdown.getMarkdown();
    expect(md).toContain("[[my-note]]");
    expect(md).toContain("see");
    expect(md).toContain("for details");
    editor.destroy();
  });

  it("parses [[slug]] markdown into wiki-link node", () => {
    const editor = createEditor("");
    editor.commands.setContent("check [[my-note]] here");
    const json = editor.getJSON();

    // Find the wikiLink node in the document
    const paragraph = json.content?.[0];
    const wikiNode = paragraph?.content?.find((n: any) => n.type === "wikiLink");
    expect(wikiNode).toBeDefined();
    expect(wikiNode?.attrs?.slug).toBe("my-note");
    editor.destroy();
  });

  it("roundtrips: insert node → serialize → parse → same node", () => {
    const editor1 = createEditor("");
    editor1.commands.insertContent([
      { type: "paragraph", content: [
        { type: "wikiLink", attrs: { slug: "test-slug", path: "" } },
      ]},
    ]);
    const md = editor1.storage.markdown.getMarkdown();
    expect(md).toContain("[[test-slug]]");
    editor1.destroy();

    // Parse the serialized markdown back
    const editor2 = createEditor("");
    editor2.commands.setContent(md);
    const json = editor2.getJSON();
    const paragraph = json.content?.[0];
    const wikiNode = paragraph?.content?.find((n: any) => n.type === "wikiLink");
    expect(wikiNode).toBeDefined();
    expect(wikiNode?.attrs?.slug).toBe("test-slug");
    editor2.destroy();
  });

  it("handles multiple wiki links in one paragraph", () => {
    const editor = createEditor("");
    editor.commands.setContent("see [[note-a]] and [[note-b]]");
    const json = editor.getJSON();
    const paragraph = json.content?.[0];
    const wikiNodes = paragraph?.content?.filter((n: any) => n.type === "wikiLink") ?? [];
    expect(wikiNodes.length).toBe(2);
    expect(wikiNodes[0]?.attrs?.slug).toBe("note-a");
    expect(wikiNodes[1]?.attrs?.slug).toBe("note-b");
    editor.destroy();
  });

  it("ignores incomplete [[ without closing ]]", () => {
    const editor = createEditor("");
    editor.commands.setContent("this [[ is not closed");
    const json = editor.getJSON();
    const paragraph = json.content?.[0];
    const wikiNodes = paragraph?.content?.filter((n: any) => n.type === "wikiLink") ?? [];
    expect(wikiNodes.length).toBe(0);
    editor.destroy();
  });
});

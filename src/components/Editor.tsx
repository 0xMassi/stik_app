import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import { open } from "@tauri-apps/plugin-shell";
import { forwardRef, useImperativeHandle, useEffect, useRef, useCallback } from "react";
import { VimMode, type VimMode as VimModeType } from "@/extensions/vim-mode";
import { StikHighlight } from "@/extensions/highlight";
import { CollapsibleHeadings } from "@/extensions/collapsible-headings";
import { WikiLink, filenameToSlug, type WikiLinkItem } from "@/extensions/wiki-link";
import { renderWikiLinkSuggestion } from "@/extensions/wiki-link-suggestion";
import { MarkdownLinkRule, normalizeUrl } from "@/extensions/markdown-link-rule";
import { TaskListInputFix } from "@/extensions/task-list-fix";
import { installParagraphMarkdownSerializer } from "@/extensions/preserve-empty-paragraphs";
import LinkPopover from "@/components/LinkPopover";
import { invoke } from "@tauri-apps/api/core";
import type { SearchResult } from "@/types";

interface EditorProps {
  onChange: (content: string) => void;
  placeholder?: string;
  initialContent?: string;
  vimEnabled?: boolean;
  onVimModeChange?: (mode: VimModeType) => void;
  onImagePaste?: (file: File) => Promise<string | null>;
  onWikiLinkClick?: (slug: string, path: string) => void;
}

export interface EditorRef {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  setContent: (content: string) => void;
  moveToEnd: () => void;
  getHTML: () => string;
  getText: () => string;
  setVimMode: (mode: VimModeType) => void;
}

const Editor = forwardRef<EditorRef, EditorProps>(
  ({ onChange, placeholder, initialContent, vimEnabled, onVimModeChange, onImagePaste, onWikiLinkClick }, ref) => {
    const wrapperRef = useRef<HTMLDivElement>(null);

    const handleMetaKey = useCallback((e: KeyboardEvent) => {
      if (e.key === "Meta") {
        wrapperRef.current?.classList.toggle("cmd-held", e.type === "keydown");
      }
    }, []);

    // Link click handling — prevent native <a> navigation, Cmd+Click opens externally
    useEffect(() => {
      const el = wrapperRef.current;
      if (!el) return;

      const handleLinkClick = (e: MouseEvent) => {
        const anchor = (e.target as HTMLElement).closest("a");
        if (!anchor) return;

        // Use raw attribute — .href returns browser-resolved URL (relative to page)
        const rawHref = anchor.getAttribute("href");
        if (!rawHref) return;

        // Always prevent native navigation (ProseMirror handles cursor via mousedown)
        e.preventDefault();

        if (e.metaKey) {
          e.stopImmediatePropagation();
          open(normalizeUrl(rawHref));
        }
      };

      const handleWindowBlur = () => el.classList.remove("cmd-held");

      el.addEventListener("click", handleLinkClick, { capture: true });
      window.addEventListener("keydown", handleMetaKey);
      window.addEventListener("keyup", handleMetaKey);
      window.addEventListener("blur", handleWindowBlur);
      return () => {
        el.removeEventListener("click", handleLinkClick, { capture: true });
        window.removeEventListener("keydown", handleMetaKey);
        window.removeEventListener("keyup", handleMetaKey);
        window.removeEventListener("blur", handleWindowBlur);
      };
    }, [handleMetaKey]);

    // Stable callback refs to avoid re-creating the editor when parent re-renders
    const onVimModeChangeRef = useRef(onVimModeChange);
    onVimModeChangeRef.current = onVimModeChange;
    const onImagePasteRef = useRef(onImagePaste);
    onImagePasteRef.current = onImagePaste;
    const onWikiLinkClickRef = useRef(onWikiLinkClick);
    onWikiLinkClickRef.current = onWikiLinkClick;

    // Extensions built once per mount. Parent uses key={vimEnabled} to force remount when toggled.
    const extensionsRef = useRef<any[] | null>(null);
    if (!extensionsRef.current) {
      const base = [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Placeholder.configure({
          placeholder: placeholder || "Start typing...",
        }),
        TaskList,
        TaskItem.extend({ addInputRules() { return []; } }).configure({ nested: true }),
        TaskListInputFix,
        Link.configure({ openOnClick: false, autolink: true }),
        MarkdownLinkRule,
        Image.configure({ inline: true, allowBase64: false }),
        StikHighlight,
        CollapsibleHeadings,
        WikiLink.configure({
          onLinkClick: (slug: string, path: string) =>
            onWikiLinkClickRef.current?.(slug, path),
          suggestion: {
            items: async ({ query }): Promise<WikiLinkItem[]> => {
              if (!query) return [];
              try {
                const results = await invoke<SearchResult[]>("search_notes", {
                  query,
                });
                return results.slice(0, 8).map((r) => ({
                  slug: filenameToSlug(r.filename),
                  path: r.path,
                  folder: r.folder,
                  snippet: r.snippet,
                }));
              } catch {
                return [];
              }
            },
            render: renderWikiLinkSuggestion,
          },
        }),
        Markdown.configure({
          html: true,
          transformPastedText: true,
          transformCopiedText: true,
        }),
      ];

      if (vimEnabled) {
        base.push(
          VimMode.configure({
            enabled: true,
            onModeChange: (mode: VimModeType) => onVimModeChangeRef.current?.(mode),
          })
        );
      }

      extensionsRef.current = base;
    }
    const extensions = extensionsRef.current;

    const editor = useEditor({
      extensions,
      content: initialContent || "",
      onUpdate: ({ editor }) => {
        onChange(editor.storage.markdown.getMarkdown());
      },
      editorProps: {
        attributes: {
          class: "stik-editor",
        },
        handlePaste: (view, event) => {
          const files = event.clipboardData?.files;
          if (!files?.length) return false;

          const imageFile = Array.from(files).find((f) => f.type.startsWith("image/"));
          if (!imageFile || !onImagePasteRef.current) return false;

          event.preventDefault();
          onImagePasteRef.current(imageFile).then((url) => {
            if (url) {
              view.dispatch(
                view.state.tr.replaceSelectionWith(
                  view.state.schema.nodes.image.create({ src: url })
                )
              );
            }
          });
          return true;
        },
        handleDrop: (view, event) => {
          const files = event.dataTransfer?.files;
          if (!files?.length) return false;

          const imageFile = Array.from(files).find((f) => f.type.startsWith("image/"));
          if (!imageFile || !onImagePasteRef.current) return false;

          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          onImagePasteRef.current(imageFile).then((url) => {
            if (url && pos) {
              view.dispatch(
                view.state.tr.insert(
                  pos.pos,
                  view.state.schema.nodes.image.create({ src: url })
                )
              );
            }
          });
          return true;
        },
      },
    });

    // Preserve visual empty rows when markdown is saved and reopened.
    useEffect(() => {
      if (!editor) return;
      installParagraphMarkdownSerializer(editor);
    }, [editor]);

    // Set initial content when editor is ready and initialContent changes
    useEffect(() => {
      if (editor && initialContent && !editor.getText()) {
        editor.commands.setContent(initialContent);
      }
    }, [editor, initialContent]);

    useImperativeHandle(ref, () => ({
      focus: () => editor?.commands.focus(),
      blur: () => editor?.commands.blur(),
      clear: () => editor?.commands.clearContent(),
      setContent: (content: string) => editor?.commands.setContent(content),
      moveToEnd: () => editor?.commands.focus("end"),
      getHTML: () => editor?.getHTML() || "",
      getText: () => editor?.getText({ blockSeparator: "\n" }) || "",
      setVimMode: (mode: VimModeType) => {
        if (editor?.storage.vimMode) {
          editor.storage.vimMode.mode = mode;
          onVimModeChangeRef.current?.(mode);
          // Dispatch triggers PluginView.update (caret-color) + decorations in one pass
          editor.view.dispatch(editor.state.tr.setMeta("vimModeChanged", mode));
        }
      },
    }));

    return (
      <div ref={wrapperRef} className="h-full relative">
        <EditorContent editor={editor} className="h-full" />
        <LinkPopover editor={editor} />
      </div>
    );
  }
);

Editor.displayName = "Editor";

export default Editor;

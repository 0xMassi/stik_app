import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";
import { open } from "@tauri-apps/plugin-shell";
import { forwardRef, useImperativeHandle, useEffect, useRef, useCallback } from "react";

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  initialContent?: string;
}

export interface EditorRef {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  setContent: (content: string) => void;
  moveToEnd: () => void;
  getHTML: () => string;
  getText: () => string;
}

const Editor = forwardRef<EditorRef, EditorProps>(
  ({ onChange, placeholder, initialContent }, ref) => {
    const wrapperRef = useRef<HTMLDivElement>(null);

    const handleMetaKey = useCallback((e: KeyboardEvent) => {
      if (e.key === "Meta") {
        wrapperRef.current?.classList.toggle("cmd-held", e.type === "keydown");
      }
    }, []);

    // Cmd+Click to open links — capture phase to fire before webview navigation
    useEffect(() => {
      const el = wrapperRef.current;
      if (!el) return;

      const handleLinkClick = (e: MouseEvent) => {
        if (e.metaKey) {
          const anchor = (e.target as HTMLElement).closest("a");
          if (anchor?.href) {
            e.preventDefault();
            e.stopImmediatePropagation();
            open(anchor.href);
          }
        }
      };

      el.addEventListener("click", handleLinkClick, { capture: true });
      window.addEventListener("keydown", handleMetaKey);
      window.addEventListener("keyup", handleMetaKey);
      window.addEventListener("blur", () => el.classList.remove("cmd-held"));
      return () => {
        el.removeEventListener("click", handleLinkClick, { capture: true });
        window.removeEventListener("keydown", handleMetaKey);
        window.removeEventListener("keyup", handleMetaKey);
      };
    }, [handleMetaKey]);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Placeholder.configure({
          placeholder: placeholder || "Start typing...",
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Link.configure({ openOnClick: false }),
        Markdown.configure({
          transformPastedText: true,
          transformCopiedText: true,
        }),
      ],
      content: initialContent || "",
      onUpdate: ({ editor }) => {
        onChange(editor.storage.markdown.getMarkdown());
      },
      editorProps: {
        attributes: {
          class: "stik-editor",
        },
      },
    });

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
    }));

    return (
      <div ref={wrapperRef} className="h-full">
        <EditorContent editor={editor} className="h-full" />
      </div>
    );
  }
);

Editor.displayName = "Editor";

export default Editor;

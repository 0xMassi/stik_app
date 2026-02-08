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

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  initialContent?: string;
  vimEnabled?: boolean;
  onVimModeChange?: (mode: VimModeType) => void;
  onImagePaste?: (file: File) => Promise<string | null>;
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
  ({ onChange, placeholder, initialContent, vimEnabled, onVimModeChange, onImagePaste }, ref) => {
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

    // Stable callback refs to avoid re-creating the editor when parent re-renders
    const onVimModeChangeRef = useRef(onVimModeChange);
    onVimModeChangeRef.current = onVimModeChange;
    const onImagePasteRef = useRef(onImagePaste);
    onImagePasteRef.current = onImagePaste;

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
        TaskItem.configure({ nested: true }),
        Link.configure({ openOnClick: false }),
        Image.configure({ inline: true, allowBase64: false }),
        Markdown.configure({
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
      <div ref={wrapperRef} className="h-full">
        <EditorContent editor={editor} className="h-full" />
      </div>
    );
  }
);

Editor.displayName = "Editor";

export default Editor;

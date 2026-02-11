import { useState, useEffect, useCallback, useRef } from "react";
import type { Editor } from "@tiptap/core";

interface FormattingToolbarProps {
  editor: Editor | null;
}

interface ActiveState {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  link: boolean;
  blockquote: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  highlight: boolean;
  heading1: boolean;
  heading2: boolean;
  heading3: boolean;
  hasSelection: boolean;
}

const EMPTY_STATE: ActiveState = {
  bold: false,
  italic: false,
  strike: false,
  code: false,
  link: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
  taskList: false,
  highlight: false,
  heading1: false,
  heading2: false,
  heading3: false,
  hasSelection: false,
};

function readActiveState(editor: Editor): ActiveState {
  return {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    strike: editor.isActive("strike"),
    code: editor.isActive("code"),
    link: editor.isActive("link"),
    blockquote: editor.isActive("blockquote"),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    taskList: editor.isActive("taskList"),
    highlight: editor.isActive("highlight"),
    heading1: editor.isActive("heading", { level: 1 }),
    heading2: editor.isActive("heading", { level: 2 }),
    heading3: editor.isActive("heading", { level: 3 }),
    hasSelection: !editor.state.selection.empty,
  };
}

function statesEqual(a: ActiveState, b: ActiveState): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.strike === b.strike &&
    a.code === b.code &&
    a.link === b.link &&
    a.blockquote === b.blockquote &&
    a.bulletList === b.bulletList &&
    a.orderedList === b.orderedList &&
    a.taskList === b.taskList &&
    a.highlight === b.highlight &&
    a.heading1 === b.heading1 &&
    a.heading2 === b.heading2 &&
    a.heading3 === b.heading3 &&
    a.hasSelection === b.hasSelection
  );
}

/** Prevent mousedown from stealing editor focus */
function preventFocus(e: React.MouseEvent) {
  e.preventDefault();
}

export default function FormattingToolbar({ editor }: FormattingToolbarProps) {
  const [active, setActive] = useState<ActiveState>(EMPTY_STATE);
  const [headingOpen, setHeadingOpen] = useState(false);
  const prevRef = useRef<ActiveState>(EMPTY_STATE);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Track active formatting state from editor transactions
  useEffect(() => {
    if (!editor) return;

    const onTransaction = () => {
      const next = readActiveState(editor);
      if (!statesEqual(prevRef.current, next)) {
        prevRef.current = next;
        setActive(next);
      }
    };

    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
    };
  }, [editor]);

  // Close heading dropdown on outside click
  useEffect(() => {
    if (!headingOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setHeadingOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [headingOpen]);

  const cmd = useCallback(
    (fn: () => void) => {
      if (!editor) return;
      fn();
    },
    [editor]
  );

  if (!editor) return null;

  const activeHeading = active.heading1 ? 1 : active.heading2 ? 2 : active.heading3 ? 3 : 0;

  return (
    <div className="formatting-toolbar" onMouseDown={preventFocus}>
      {/* Heading dropdown */}
      <div className="fmt-heading-wrap" ref={dropdownRef}>
        <button
          className={`fmt-btn fmt-btn-heading${activeHeading ? " fmt-active" : ""}`}
          onMouseDown={preventFocus}
          onClick={() => setHeadingOpen(!headingOpen)}
          title="Heading"
        >
          <span className="fmt-heading-label">H{activeHeading || ""}</span>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
            <path d="M1 5.5L4 2.5L7 5.5" />
          </svg>
        </button>
        {headingOpen && (
          <div className="fmt-heading-dropdown">
            {([1, 2, 3] as const).map((level) => (
              <button
                key={level}
                className={`fmt-heading-option${activeHeading === level ? " fmt-active" : ""}`}
                onMouseDown={preventFocus}
                onClick={() => {
                  cmd(() => editor.chain().focus().toggleHeading({ level }).run());
                  setHeadingOpen(false);
                }}
              >
                H{level}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="fmt-sep" />

      <button
        className={`fmt-btn${active.bold ? " fmt-active" : ""}`}
        onMouseDown={preventFocus}
        onClick={() => cmd(() => editor.chain().focus().toggleBold().run())}
        title="Bold"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" opacity="0" />
          <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7c-.55 0-1 .45-1 1v12c0 .55.45 1 1 1h6.63c2.09 0 3.87-1.71 3.87-3.8 0-1.52-.86-2.82-2.16-3.41zM9 6.5h4c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5H9v-3zm4.5 9H9v-3h4.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
        </svg>
      </button>

      <button
        className={`fmt-btn${active.italic ? " fmt-active" : ""}`}
        onMouseDown={preventFocus}
        onClick={() => cmd(() => editor.chain().focus().toggleItalic().run())}
        title="Italic"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
        </svg>
      </button>

      <button
        className={`fmt-btn${active.strike ? " fmt-active" : ""}`}
        onMouseDown={preventFocus}
        onClick={() => cmd(() => editor.chain().focus().toggleStrike().run())}
        title="Strikethrough"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z" />
        </svg>
      </button>

      <button
        className={`fmt-btn${active.code ? " fmt-active" : ""}`}
        onMouseDown={preventFocus}
        onClick={() => cmd(() => editor.chain().focus().toggleCode().run())}
        title="Inline code"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>

      {/* Link: triggers Cmd+K to open the LinkPopover editor */}
      <button
        className={`fmt-btn${active.link ? " fmt-active" : ""}${!active.link && !active.hasSelection ? " fmt-disabled" : ""}`}
        onMouseDown={preventFocus}
        onClick={() => {
          if (active.link) {
            cmd(() => editor.chain().focus().unsetLink().run());
          } else if (active.hasSelection) {
            // Dispatch Cmd+K to trigger the LinkPopover edit flow
            editor.view.dom.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "k",
                code: "KeyK",
                metaKey: true,
                bubbles: true,
                cancelable: true,
              })
            );
          }
        }}
        title={active.link ? "Remove link" : "Add link (select text first)"}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </button>

      <div className="fmt-sep" />

      <button
        className={`fmt-btn${active.blockquote ? " fmt-active" : ""}`}
        onMouseDown={preventFocus}
        onClick={() => cmd(() => editor.chain().focus().toggleBlockquote().run())}
        title="Blockquote"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
        </svg>
      </button>

      <button
        className={`fmt-btn${active.bulletList ? " fmt-active" : ""}`}
        onMouseDown={preventFocus}
        onClick={() => cmd(() => editor.chain().focus().toggleBulletList().run())}
        title="Bullet list"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" />
        </svg>
      </button>

      <button
        className={`fmt-btn${active.orderedList ? " fmt-active" : ""}`}
        onMouseDown={preventFocus}
        onClick={() => cmd(() => editor.chain().focus().toggleOrderedList().run())}
        title="Ordered list"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" />
        </svg>
      </button>

      <button
        className={`fmt-btn${active.taskList ? " fmt-active" : ""}`}
        onMouseDown={preventFocus}
        onClick={() => cmd(() => editor.chain().focus().toggleTaskList().run())}
        title="Task list"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="6" height="6" rx="1" />
          <path d="M5 8l1.5 1.5L9 6.5" />
          <line x1="13" y1="8" x2="21" y2="8" />
          <rect x="3" y="14" width="6" height="6" rx="1" />
          <line x1="13" y1="17" x2="21" y2="17" />
        </svg>
      </button>

      <div className="fmt-sep" />

      {/* Highlight: only toggles with selection (inclusive:false means stored marks last 1 char) */}
      <button
        className={`fmt-btn${active.highlight ? " fmt-active" : ""}${!active.highlight && !active.hasSelection ? " fmt-disabled" : ""}`}
        onMouseDown={preventFocus}
        onClick={() => {
          if (active.highlight || active.hasSelection) {
            cmd(() => editor.chain().focus().toggleHighlight().run());
          }
        }}
        title={active.hasSelection || active.highlight ? "Highlight" : "Highlight (select text first)"}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.5 1.15c-.53 0-1.04.19-1.43.58l-5.81 5.82 5.65 5.65 5.82-5.81c.77-.78.77-2.04 0-2.83l-2.84-2.83c-.39-.39-.89-.58-1.39-.58zM10.3 8.5l-4.59 4.58c-.89.89-.89 2.34 0 3.24L7.13 22h2.82l-2.07-5.68 4.62-4.62L10.3 8.5zM5 22c0 .55.45 1 1 1h2l-3-3-.01 2z" />
        </svg>
      </button>
    </div>
  );
}

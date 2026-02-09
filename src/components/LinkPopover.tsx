/**
 * Floating popover that appears when the cursor is inside a link.
 * Actions: Open in browser, Copy URL, Edit URL, Remove link.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { normalizeUrl } from "@/extensions/markdown-link-rule";
import type { Editor } from "@tiptap/core";

interface LinkPopoverProps {
  editor: Editor | null;
}

interface LinkInfo {
  href: string;
  text: string;
  from: number;
  to: number;
  bottom: number;
  left: number;
  editorWidth: number;
}

function getActiveLinkInfo(editor: Editor): LinkInfo | null {
  const { state } = editor;
  const { from, empty } = state.selection;

  // Only show for cursor (no range selection) to avoid clutter
  if (!empty) return null;

  const linkMark = state.schema.marks.link;
  if (!linkMark) return null;

  const $pos = state.doc.resolve(from);
  const marks = $pos.marks();
  const link = marks.find((m) => m.type === linkMark);
  if (!link) return null;

  const href = link.attrs.href as string;
  if (!href) return null;

  // Find the full extent of the link mark around the cursor
  let markFrom = from;
  let markTo = from;

  // Walk backward
  const parentNode = $pos.parent;
  const parentOffset = $pos.parentOffset;
  for (let i = parentOffset - 1; i >= 0; i--) {
    const resolved = state.doc.resolve($pos.start() + i);
    if (resolved.marks().some((m) => m.type === linkMark && m.attrs.href === href)) {
      markFrom = $pos.start() + i;
    } else break;
  }

  // Walk forward
  const textLength = parentNode.content.size;
  for (let i = parentOffset; i < textLength; i++) {
    const resolved = state.doc.resolve($pos.start() + i);
    if (resolved.marks().some((m) => m.type === linkMark && m.attrs.href === href)) {
      markTo = $pos.start() + i + 1;
    } else break;
  }

  // Get coordinates for positioning
  const coords = editor.view.coordsAtPos(from);
  const editorRect = editor.view.dom.getBoundingClientRect();
  const text = state.doc.textBetween(markFrom, markTo, " ", " ");

  return {
    href,
    text,
    from: markFrom,
    to: markTo,
    bottom: coords.bottom - editorRect.top,
    left: coords.left - editorRect.left,
    editorWidth: editorRect.width,
  };
}

export default function LinkPopover({ editor }: LinkPopoverProps) {
  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [editHref, setEditHref] = useState("");
  const [copied, setCopied] = useState(false);
  const [popoverWidth, setPopoverWidth] = useState(0);
  const textInputRef = useRef<HTMLInputElement>(null);
  const hrefInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const isEditingRef = useRef(false);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  const updateLinkInfo = useCallback(() => {
    if (!editor) {
      setLinkInfo(null);
      setIsEditing(false);
      return;
    }

    // While focus is transitioning from editor -> popover controls,
    // avoid clearing state here. handleBlur owns hide timing.
    if (!editor.isFocused) return;

    const info = getActiveLinkInfo(editor);
    setLinkInfo(info);
    if (!info) setIsEditing(false);
  }, [editor]);

  const handleBlur = useCallback(() => {
    // Delay so clicks on the popover itself register before hiding
    setTimeout(() => {
      if (isEditingRef.current) return;
      if (!popoverRef.current?.contains(document.activeElement)) {
        setLinkInfo(null);
        setIsEditing(false);
      }
    }, 150);
  }, []);

  useEffect(() => {
    if (!editor) return;

    editor.on("selectionUpdate", updateLinkInfo);
    editor.on("transaction", updateLinkInfo);
    editor.on("blur", handleBlur);
    window.addEventListener("resize", updateLinkInfo);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateLinkInfo();
      });
      resizeObserver.observe(editor.view.dom);
    }

    return () => {
      editor.off("selectionUpdate", updateLinkInfo);
      editor.off("transaction", updateLinkInfo);
      editor.off("blur", handleBlur);
      window.removeEventListener("resize", updateLinkInfo);
      resizeObserver?.disconnect();
    };
  }, [editor, updateLinkInfo, handleBlur]);

  useEffect(() => {
    if (!linkInfo) return;
    const frame = requestAnimationFrame(() => {
      setPopoverWidth(popoverRef.current?.offsetWidth ?? 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [linkInfo, isEditing, copied, editHref, editText]);

  const handleOpen = useCallback(() => {
    if (linkInfo?.href) open(normalizeUrl(linkInfo.href));
  }, [linkInfo]);

  const handleCopy = useCallback(async () => {
    if (!linkInfo?.href) return;
    try {
      await navigator.clipboard.writeText(linkInfo.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = linkInfo.href;
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [linkInfo]);

  const handleStartEdit = useCallback(() => {
    if (!linkInfo) return;
    setEditText(linkInfo.text);
    setEditHref(linkInfo.href);
    setIsEditing(true);
    setTimeout(() => textInputRef.current?.select(), 0);
  }, [linkInfo]);

  const handleSaveEdit = useCallback(() => {
    if (!editor || !linkInfo) return;
    const href = editHref.trim() ? normalizeUrl(editHref.trim()) : "";
    const text = editText.trim() || linkInfo.text || href;
    if (!href || !text) return;

    const linkMark = editor.state.schema.marks.link;
    const mark = linkMark?.create({ href });
    const textNode = mark
      ? editor.state.schema.text(text, [mark])
      : editor.state.schema.text(text);

    const transaction = editor.state.tr.replaceWith(linkInfo.from, linkInfo.to, textNode);
    editor.view.dispatch(transaction);

    setIsEditing(false);
    editor.commands.focus();
  }, [editor, linkInfo, editHref, editText]);

  const handleUnlink = useCallback(() => {
    if (!editor || !linkInfo) return;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: linkInfo.from, to: linkInfo.to })
      .unsetLink()
      .run();
    setLinkInfo(null);
  }, [editor, linkInfo]);

  if (!linkInfo) return null;

  const maxLeft = Math.max(4, linkInfo.editorWidth - popoverWidth - 4);
  const left = Math.max(4, Math.min(linkInfo.left - 8, maxLeft));

  return (
    <div
      ref={popoverRef}
      className="link-popover"
      style={{
        top: `${linkInfo.bottom + 6}px`,
        left: `${left}px`,
      }}
    >
      {isEditing ? (
        <form
          className="link-popover-edit"
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveEdit();
          }}
        >
          <div className="link-popover-field">
            <span className="link-popover-field-label">Text</span>
            <input
              ref={textInputRef}
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setIsEditing(false);
                  editor?.commands.focus();
                } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
                  e.preventDefault();
                  hrefInputRef.current?.focus();
                  hrefInputRef.current?.select();
                }
              }}
              className="link-popover-input"
              placeholder="Link text"
              spellCheck={false}
            />
          </div>
          <div className="link-popover-field">
            <span className="link-popover-field-label">URL</span>
            <input
              ref={hrefInputRef}
              type="text"
              value={editHref}
              onChange={(e) => setEditHref(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setIsEditing(false);
                  editor?.commands.focus();
                }
              }}
              className="link-popover-input"
              placeholder="https://"
              spellCheck={false}
            />
          </div>
          <div className="link-popover-edit-actions">
            <button type="submit" className="link-popover-btn link-popover-save">
              Save
            </button>
          </div>
        </form>
      ) : (
        <>
          <a
            className="link-popover-url"
            href={linkInfo.href}
            onClick={(e) => {
              e.preventDefault();
              handleOpen();
            }}
            title={linkInfo.href}
          >
            {linkInfo.href.length > 40
              ? linkInfo.href.slice(0, 38) + "\u2026"
              : linkInfo.href}
          </a>
          <div className="link-popover-actions">
            <button
              onClick={handleOpen}
              className="link-popover-btn"
              title="Open in browser"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
            <button
              onClick={handleCopy}
              className="link-popover-btn"
              title={copied ? "Copied!" : "Copy URL"}
            >
              {copied ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
            <button
              onClick={handleStartEdit}
              className="link-popover-btn"
              title="Edit link"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              onClick={handleUnlink}
              className="link-popover-btn link-popover-unlink"
              title="Remove link"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 7h3a5 5 0 0 1 0 10h-3m-6 0H6a5 5 0 0 1 0-10h3" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

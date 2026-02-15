/**
 * Floating popover that appears when the cursor is inside a markdown link.
 * Actions: Open in browser, Copy URL, Edit URL, Remove link.
 *
 * CodeMirror version — detects [text](url) via regex on the current line.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import type { EditorView } from "@codemirror/view";
import { normalizeUrl } from "@/utils/normalizeUrl";
import { consumeEscapeForPopover } from "@/utils/popoverEscape";

interface LinkPopoverProps {
  editorRef: { current: EditorView | null };
  getView: () => EditorView | null;
}

interface LinkInfo {
  href: string;
  text: string;
  from: number; // doc position of [
  to: number; // doc position after )
  textFrom: number; // doc position of the link text start
  textTo: number; // doc position of the link text end
  bottom: number; // px relative to editor
  left: number; // px relative to editor
  editorWidth: number;
}

const LINK_RE = /\[([^\]]*)\]\(([^)]*)\)/g;

function getActiveLinkInfo(view: EditorView): LinkInfo | null {
  const { state } = view;
  const { from: cursorPos } = state.selection.main;

  // Only show for collapsed cursor
  if (!state.selection.main.empty) return null;

  const line = state.doc.lineAt(cursorPos);
  const offset = cursorPos - line.from;

  LINK_RE.lastIndex = 0;
  let match;
  while ((match = LINK_RE.exec(line.text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset >= start && offset <= end) {
      const linkText = match[1];
      const href = match[2];
      if (!href) continue;

      const docFrom = line.from + start;
      const docTo = line.from + end;
      const textFrom = line.from + start + 1; // after [
      const textTo = textFrom + linkText.length; // before ]

      // Get coordinates for positioning
      const coords = view.coordsAtPos(cursorPos);
      if (!coords) return null;

      const editorRect = view.dom.getBoundingClientRect();

      return {
        href,
        text: linkText,
        from: docFrom,
        to: docTo,
        textFrom,
        textTo,
        bottom: coords.bottom - editorRect.top,
        left: coords.left - editorRect.left,
        editorWidth: editorRect.width,
      };
    }
  }

  return null;
}

export default function LinkPopover({ getView }: LinkPopoverProps) {
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
  const focusHrefOnEditRef = useRef(false);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  const updateLinkInfo = useCallback(() => {
    const view = getView();
    if (!view) {
      setLinkInfo(null);
      setIsEditing(false);
      return;
    }

    // Don't clear while editing
    if (isEditingRef.current) return;

    // Check if editor is focused
    if (!view.hasFocus) return;

    const info = getActiveLinkInfo(view);
    setLinkInfo(info);
    if (!info) setIsEditing(false);
  }, [getView]);

  // Poll for cursor changes (CodeMirror doesn't have TipTap's event system built-in here)
  useEffect(() => {
    const view = getView();
    if (!view) return;

    // Listen for selection changes via a timer (CM updateListener is in Editor.tsx)
    const interval = setInterval(updateLinkInfo, 200);
    return () => clearInterval(interval);
  }, [getView, updateLinkInfo]);

  // Also update on key/mouse events
  useEffect(() => {
    const handleKeyUp = () => updateLinkInfo();
    const handleClick = () => setTimeout(updateLinkInfo, 50);

    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("click", handleClick);
    };
  }, [updateLinkInfo]);

  useEffect(() => {
    if (!isEditing) return;

    setTimeout(() => {
      if (focusHrefOnEditRef.current) {
        focusHrefOnEditRef.current = false;
        hrefInputRef.current?.focus();
        hrefInputRef.current?.select();
        return;
      }
      textInputRef.current?.select();
    }, 0);
  }, [isEditing]);

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
    focusHrefOnEditRef.current = false;
    setIsEditing(true);
  }, [linkInfo]);

  const handleSaveEdit = useCallback(() => {
    const view = getView();
    if (!view || !linkInfo) return;

    const href = editHref.trim() ? normalizeUrl(editHref.trim()) : "";
    const text = editText.trim() || linkInfo.text || href;
    if (!href || !text) return;

    const replacement = `[${text}](${href})`;
    view.dispatch({
      changes: { from: linkInfo.from, to: linkInfo.to, insert: replacement },
    });

    setIsEditing(false);
    view.focus();
  }, [getView, linkInfo, editHref, editText]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    getView()?.focus();
  }, [getView]);

  const handleUnlink = useCallback(() => {
    const view = getView();
    if (!view || !linkInfo) return;

    // Replace [text](url) with just text
    view.dispatch({
      changes: { from: linkInfo.from, to: linkInfo.to, insert: linkInfo.text },
    });
    setLinkInfo(null);
  }, [getView, linkInfo]);

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
          onKeyDown={(e) => {
            consumeEscapeForPopover(e, handleCancelEdit);
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
                if (consumeEscapeForPopover(e, handleCancelEdit)) return;
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
                  e.preventDefault();
                  e.stopPropagation();
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
                consumeEscapeForPopover(e, handleCancelEdit);
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

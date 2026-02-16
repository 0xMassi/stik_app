/**
 * CodeMirror 6 editor for Stik — raw markdown editing with syntax highlighting.
 *
 * Same EditorRef/EditorProps interface as the old TipTap editor so PostIt.tsx
 * can swap in with minimal changes.
 */

import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  keymap,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab, insertNewline } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { autocompletion, closeCompletion, completionStatus } from "@codemirror/autocomplete";
import { search, searchKeymap } from "@codemirror/search";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { stikEditorTheme, stikHighlightStyle } from "@/extensions/cm-theme";
import {
  toggleInlineFormat,
  insertLink,
  detectFormatState,
  type FormatState,
} from "@/extensions/cm-formatting";
import {
  wikiLinkDecorations,
  wikiLinkClickHandler,
  wikiLinkCompletionSource,
} from "@/extensions/cm-wiki-link";
import { slashCommandCompletionSource } from "@/extensions/cm-slash-commands";
import { blockWidgetPlugin } from "@/extensions/cm-block-widgets";
import {
  createVimExtension,
  handleVimArrowInVisualMode,
  setupVimModeListener,
  registerVimCommands,
  setVimModeOnView,
  vimCompartment,
  type VimMode,
} from "@/extensions/cm-vim";
import { highlightExtension } from "@/extensions/cm-highlight";
import { taskCheckboxPlugin, taskCheckboxHandler } from "@/extensions/cm-task-toggle";
import { hideMarkersPlugin, autoCloseMarkup } from "@/extensions/cm-hide-markers";
import { filenameToSlug } from "@/utils/wikiLink";
import { normalizeUrl } from "@/utils/normalizeUrl";
import { isImageUrl } from "@/utils/isImageUrl";
import { isImageFile } from "@/utils/isImageFile";
import { extractDroppedImagePath } from "@/utils/droppedImagePath";
import {
  findExternalLinkAtOffset,
  shouldShowCmdLinkCursor,
} from "@/utils/externalLinkHitTest";
import { markdownToHtml, markdownToPlainText } from "@/utils/markdownToHtml";
import { createVimCommandCallbacks } from "@/utils/vimCommandBridge";
import FormattingToolbar from "@/components/FormattingToolbar";
import LinkPopover from "@/components/LinkPopover";
import type { SearchResult } from "@/types";

export { type VimMode } from "@/extensions/cm-vim";

interface EditorProps {
  onChange: (content: string) => void;
  placeholder?: string;
  initialContent?: string;
  vimEnabled?: boolean;
  showFormatToolbar?: boolean;
  onVimModeChange?: (mode: VimMode) => void;
  onVimSaveAndClose?: () => void;
  onVimCloseWithoutSaving?: () => void;
  onImagePaste?: (file: File) => Promise<string | null>;
  onImageDropPath?: (path: string) => Promise<string | null>;
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
  setVimMode: (mode: VimMode) => void;
  getView: () => EditorView | null;
  getFormatState: () => FormatState;
}

const Editor = forwardRef<EditorRef, EditorProps>(
  (
    {
      onChange,
      placeholder,
      initialContent,
      vimEnabled,
      showFormatToolbar,
      onVimModeChange,
      onVimSaveAndClose,
      onVimCloseWithoutSaving,
      onImagePaste,
      onImageDropPath,
      onWikiLinkClick,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const formatStateRef = useRef<FormatState>({
      bold: false, italic: false, strike: false, code: false,
      highlight: false, heading: 0, blockquote: false, bulletList: false,
      orderedList: false, taskList: false, link: false, hasSelection: false,
    });

    // Stable refs for callbacks to avoid recreating extensions
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onVimModeChangeRef = useRef(onVimModeChange);
    onVimModeChangeRef.current = onVimModeChange;
    const onVimSaveAndCloseRef = useRef(onVimSaveAndClose);
    onVimSaveAndCloseRef.current = onVimSaveAndClose;
    const onVimCloseWithoutSavingRef = useRef(onVimCloseWithoutSaving);
    onVimCloseWithoutSavingRef.current = onVimCloseWithoutSaving;
    const onImagePasteRef = useRef(onImagePaste);
    onImagePasteRef.current = onImagePaste;
    const onImageDropPathRef = useRef(onImageDropPath);
    onImageDropPathRef.current = onImageDropPath;
    const onWikiLinkClickRef = useRef(onWikiLinkClick);
    onWikiLinkClickRef.current = onWikiLinkClick;
    const lastDomDropAtRef = useRef(0);
    const formatStateCallbackRef = useRef<((state: FormatState) => void) | null>(null);

    // Notify toolbar of format state changes
    const setFormatStateCallback = useCallback((cb: (state: FormatState) => void) => {
      formatStateCallbackRef.current = cb;
    }, []);

    // Initialize CodeMirror
    useEffect(() => {
      if (!containerRef.current) return;

      const formatKeybindings = keymap.of([
        {
          key: "ArrowLeft",
          run: (view) => handleVimArrowInVisualMode(view, "ArrowLeft"),
        },
        {
          key: "ArrowRight",
          run: (view) => handleVimArrowInVisualMode(view, "ArrowRight"),
        },
        {
          key: "ArrowUp",
          run: (view) => handleVimArrowInVisualMode(view, "ArrowUp"),
        },
        {
          key: "ArrowDown",
          run: (view) => handleVimArrowInVisualMode(view, "ArrowDown"),
        },
        {
          key: "Escape",
          run: (view) => {
            const status = completionStatus(view.state);
            if (status === "active" || status === "pending") {
              closeCompletion(view);
              return true;
            }
            return false;
          },
        },
        // Smart Enter: if cursor is right before closing markers (** ~~ ==),
        // close the formatting first, then newline. Markdown inline syntax
        // can't span lines, so this prevents broken formatting.
        {
          key: "Enter",
          run: (view) => {
            const { head, empty } = view.state.selection.main;
            if (empty) {
              const doc = view.state.doc;
              const after = doc.sliceString(head, Math.min(head + 2, doc.length));
              if (after === "**" || after === "~~" || after === "==") {
                view.dispatch({
                  changes: { from: head + 2, insert: "\n" },
                  selection: { anchor: head + 2 + 1 },
                });
                return true;
              }
            }
            return insertNewline(view);
          },
        },
        // Smart Backspace: when cursor is between empty auto-closed pair
        // (****  ~~~~  ====), delete the entire pair in one stroke.
        // Without this, hidden markers create a confusing experience —
        // the user sees nothing but Backspace would only delete one marker char.
        {
          key: "Backspace",
          run: (view) => {
            const { head, empty } = view.state.selection.main;
            if (!empty || head < 2) return false;
            const doc = view.state.doc;
            if (head + 2 > doc.length) return false;
            const around = doc.sliceString(head - 2, head + 2);
            if (around === "****" || around === "~~~~" || around === "====") {
              view.dispatch({
                changes: { from: head - 2, to: head + 2, insert: "" },
                selection: { anchor: head - 2 },
              });
              return true;
            }
            return false;
          },
        },
        {
          key: "Mod-b",
          run: (view) => { toggleInlineFormat(view, "**"); return true; },
        },
        {
          key: "Mod-i",
          run: (view) => { toggleInlineFormat(view, "*"); return true; },
        },
        {
          key: "Mod-k",
          run: (view) => { insertLink(view); return true; },
        },
      ]);

      // Image paste/drop handlers
      const imageHandlers = EditorView.domEventHandlers({
        paste(event: ClipboardEvent, view: EditorView) {
          const files = event.clipboardData?.files;
          if (files?.length) {
            const imageFile = Array.from(files).find(isImageFile);
            if (imageFile && onImagePasteRef.current) {
              event.preventDefault();
              onImagePasteRef.current(imageFile).then((url) => {
                if (url) {
                  const insert = `![](${url})`;
                  view.dispatch({
                    changes: { from: view.state.selection.main.from, to: view.state.selection.main.to, insert },
                    selection: { anchor: view.state.selection.main.from + insert.length },
                  });
                }
              });
              return true;
            }
          }

          const pastedText = event.clipboardData?.getData("text/plain")?.trim() ?? "";
          if (isImageUrl(pastedText)) {
            event.preventDefault();
            const insert = `![](${pastedText})`;
            view.dispatch({
              changes: { from: view.state.selection.main.from, to: view.state.selection.main.to, insert },
              selection: { anchor: view.state.selection.main.from + insert.length },
            });
            return true;
          }
          return false;
        },
        drop(event: DragEvent, view: EditorView) {
          const files = event.dataTransfer?.files;
          if (files?.length) {
            const imageFile = Array.from(files).find(isImageFile);
            if (imageFile && onImagePasteRef.current) {
              event.preventDefault();
              lastDomDropAtRef.current = Date.now();
              onImagePasteRef.current(imageFile).then((url) => {
                if (url) {
                  const insert = `![](${url})`;
                  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from;
                  view.dispatch({
                    changes: { from: pos, to: pos, insert },
                  });
                }
              });
              return true;
            }
          }

          const droppedUriList = event.dataTransfer?.getData("text/uri-list") ?? "";
          const droppedUri = droppedUriList
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => line && !line.startsWith("#"));
          const droppedPlainText = event.dataTransfer?.getData("text/plain")?.trim() ?? "";
          const droppedValue = droppedUri || droppedPlainText;
          const droppedPath = extractDroppedImagePath(droppedValue);

          if (droppedPath && onImageDropPathRef.current) {
            event.preventDefault();
            lastDomDropAtRef.current = Date.now();
            onImageDropPathRef.current(droppedPath).then((url) => {
              if (url) {
                const insert = `![](${url})`;
                const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from;
                view.dispatch({ changes: { from: pos, to: pos, insert } });
              }
            });
            return true;
          }

          if (isImageUrl(droppedValue)) {
            event.preventDefault();
            lastDomDropAtRef.current = Date.now();
            const insert = `![](${droppedValue})`;
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from;
            view.dispatch({ changes: { from: pos, to: pos, insert } });
            return true;
          }

          return false;
        },
      });

      const setCmdHoverCursor = (view: EditorView, active: boolean) => {
        const next = active ? "pointer" : "";
        if (view.contentDOM.style.cursor !== next) {
          view.contentDOM.style.cursor = next;
        }
      };

      // Link interaction handler:
      // - Cmd+Click opens external link in browser
      // - Cmd+Hover shows pointer cursor on navigable links
      const linkClickHandler = EditorView.domEventHandlers({
        click(event: MouseEvent, view: EditorView) {
          if (!event.metaKey) return false;

          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos === null) return false;

          const line = view.state.doc.lineAt(pos);
          const offset = pos - line.from;
          const hit = findExternalLinkAtOffset(line.text, offset);
          if (!hit) return false;

          event.preventDefault();
          open(normalizeUrl(hit));
          return true;
        },
        mousemove(event: MouseEvent, view: EditorView) {
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos === null) {
            setCmdHoverCursor(view, false);
            return false;
          }

          const line = view.state.doc.lineAt(pos);
          const offset = pos - line.from;
          setCmdHoverCursor(
            view,
            shouldShowCmdLinkCursor({
              metaKey: event.metaKey,
              lineText: line.text,
              offset,
            })
          );
          return false;
        },
        mouseleave(_event: MouseEvent, view: EditorView) {
          setCmdHoverCursor(view, false);
          return false;
        },
        keyup(event: KeyboardEvent, view: EditorView) {
          if (!event.metaKey) setCmdHoverCursor(view, false);
          return false;
        },
        blur(_event: FocusEvent, view: EditorView) {
          setCmdHoverCursor(view, false);
          return false;
        },
      });

      // Rich text copy: put both text/html and clean text/plain on clipboard
      // Runs before CM6's built-in copy handler, so returning true prevents
      // the default which only sets text/plain with raw markdown.
      const richCopyHandler = EditorView.domEventHandlers({
        copy(event: ClipboardEvent, view: EditorView) {
          const { from, to } = view.state.selection.main;
          if (from === to) return false; // no selection — let CM handle line-wise copy

          const md = view.state.sliceDoc(from, to);
          const html = markdownToHtml(md);
          const plain = markdownToPlainText(md);

          if (event.clipboardData) {
            event.clipboardData.clearData();
            event.clipboardData.setData("text/plain", plain);
            event.clipboardData.setData("text/html", html);
            event.preventDefault();
            return true;
          }
          return false;
        },
      });

      // Autocomplete: wiki-links ([[) + slash commands (/)
      const combinedAutocomplete = autocompletion({
        override: [
          wikiLinkCompletionSource(async (query: string) => {
            try {
              const results = await invoke<SearchResult[]>("search_notes", { query });
              return results.slice(0, 8).map((r) => ({
                slug: filenameToSlug(r.filename),
                path: r.path,
                folder: r.folder,
              }));
            } catch {
              return [];
            }
          }),
          slashCommandCompletionSource,
        ],
        activateOnTyping: true,
      });

      // Wiki-link click handler
      const wikiClickHandler = wikiLinkClickHandler((slug: string, _path: string) => {
        // Resolve path from slug by searching
        invoke<SearchResult[]>("search_notes", { query: slug })
          .then((results) => {
            const match = results.find(
              (r) => filenameToSlug(r.filename) === slug
            );
            if (match) {
              onWikiLinkClickRef.current?.(slug, match.path);
            }
          })
          .catch(() => {});
      });

      // Format state change listener
      const formatStateListener = EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.docChanged) {
          const state = detectFormatState(update.view);
          formatStateRef.current = state;
          formatStateCallbackRef.current?.(state);
        }
      });

      // Doc change listener
      const docChangeListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      });

      // Build extensions
      const extensions = [
        history(),
        formatKeybindings,
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        markdown({
          base: markdownLanguage,
          codeLanguages: languages,
          // Disable setext headings (text\n--- = H2) — they cause jarring
          // style jumps while typing list markers like "-" on a new line.
          // ATX headings (# H1, ## H2) are sufficient.
          extensions: [
            highlightExtension,
            {
              parseBlock: [{
                name: "SetextHeading",
                parse: () => false,
                leaf: () => null,
              }],
            },
          ],
        }),
        stikEditorTheme,
        stikHighlightStyle,
        // Required for Vim visual mode highlight:
        // @replit/codemirror-vim makes native ::selection transparent.
        // drawSelection renders .cm-selectionBackground instead.
        drawSelection(),
        cmPlaceholder(placeholder || "Start typing..."),
        search(),
        richCopyHandler,
        imageHandlers,
        linkClickHandler,
        wikiLinkDecorations(),
        wikiClickHandler,
        combinedAutocomplete,
        taskCheckboxPlugin,
        taskCheckboxHandler,
        hideMarkersPlugin,
        blockWidgetPlugin,
        autoCloseMarkup,
        formatStateListener,
        docChangeListener,
        EditorView.lineWrapping,
        // CSS class for the content element
        EditorView.contentAttributes.of({ class: "stik-editor" }),
      ];

      // Add vim mode if enabled
      if (vimEnabled) {
        extensions.push(vimCompartment.of(createVimExtension()));
      } else {
        extensions.push(vimCompartment.of([]));
      }

      const state = EditorState.create({
        doc: initialContent || "",
        extensions,
      });

      const view = new EditorView({
        state,
        parent: containerRef.current,
      });

      viewRef.current = view;

      // Setup vim mode listener after view is created
      if (vimEnabled) {
        setupVimModeListener(view, (mode) => {
          if (mode === "normal") {
            // Check if the vim status shows ":" command
            // The vim plugin handles command mode internally
          }
          onVimModeChangeRef.current?.(mode);
        });

        registerVimCommands(
          createVimCommandCallbacks({
            onSaveAndClose: () => onVimSaveAndCloseRef.current?.(),
            onCloseWithoutSaving: () => onVimCloseWithoutSavingRef.current?.(),
            onModeChange: (mode: VimMode) => onVimModeChangeRef.current?.(mode),
          })
        );
      }

      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    // ^ Intentionally empty deps: CM view is created once per mount.
    // Parent uses key={vimEnabled} to force remount when vim toggled.

    // Tauri native drag-drop fallback (WebKit dataTransfer can be empty for OS-level drops)
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;

      let unlisten: (() => void) | null = null;
      let cancelled = false;

      void getCurrentWindow()
        .onDragDropEvent((event) => {
          if (event.payload.type !== "drop") return;
          if (!onImageDropPathRef.current) return;
          if (Date.now() - lastDomDropAtRef.current < 200) return;

          const droppedPath = event.payload.paths
            .map((path) => extractDroppedImagePath(path))
            .find((path): path is string => Boolean(path));
          if (!droppedPath) return;

          void onImageDropPathRef.current(droppedPath).then((url) => {
            if (cancelled || !url || !viewRef.current) return;
            const insert = `![](${url})`;
            const pos = viewRef.current.state.selection.main.from;
            viewRef.current.dispatch({ changes: { from: pos, to: pos, insert } });
            viewRef.current.focus();
          });
        })
        .then((dispose) => {
          if (cancelled) dispose();
          else unlisten = dispose;
        })
        .catch((error) => {
          console.error("Failed to register native drag-drop listener:", error);
        });

      return () => {
        cancelled = true;
        unlisten?.();
      };
    }, []);

    useImperativeHandle(ref, () => ({
      focus: () => viewRef.current?.focus(),
      blur: () => viewRef.current?.contentDOM.blur(),
      clear: () => {
        const view = viewRef.current;
        if (view) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: "" },
          });
        }
      },
      setContent: (content: string) => {
        const view = viewRef.current;
        if (view) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: content },
          });
        }
      },
      moveToEnd: () => {
        const view = viewRef.current;
        if (view) {
          const end = view.state.doc.length;
          view.dispatch({ selection: { anchor: end } });
          view.focus();
        }
      },
      getHTML: () => {
        const text = viewRef.current?.state.doc.toString() || "";
        return markdownToHtml(text);
      },
      getText: () => viewRef.current?.state.doc.toString() || "",
      setVimMode: (mode: VimMode) => {
        if (viewRef.current && vimEnabled) {
          setVimModeOnView(viewRef.current, mode);
          onVimModeChangeRef.current?.(mode);
        }
      },
      getView: () => viewRef.current,
      getFormatState: () => formatStateRef.current,
    }));

    const toolbarVisible = showFormatToolbar && !vimEnabled;

    return (
      <div className={`h-full relative${toolbarVisible ? " has-formatting-toolbar" : ""}`}>
        <div ref={containerRef} className="h-full" />
        <LinkPopover editorRef={{ current: viewRef.current }} getView={() => viewRef.current} />
        {toolbarVisible && (
          <FormattingToolbar
            getView={() => viewRef.current}
            onFormatStateChange={setFormatStateCallback}
          />
        )}
      </div>
    );
  }
);

Editor.displayName = "Editor";

export default Editor;

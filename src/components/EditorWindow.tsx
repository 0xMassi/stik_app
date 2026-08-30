/**
 * EditorWindow — Stik's full editor mode.
 *
 * Resizable main window (windows.rs "editor", Overlay title bar) reusing the same
 * CodeMirror Editor as the sticky. Left: a folder dropdown (nested, Obsidian-style;
 * pick one folder at a time, with per-folder colour + icon), search, and a note list
 * with per-note actions (pin / rename / archive / delete). Right: the document canvas
 * with debounced autosave. Settings reuse the app's SettingsModal as an in-editor overlay.
 *
 * Folders are relative paths ("Projects/Work"); per-folder colour/icon persist in
 * settings.folder_colors / folder_icons. Pin-to-top is localStorage for now.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor, { type EditorRef } from "./Editor";
import SettingsModal from "./SettingsModal";
import { getFolderColor, FOLDER_COLORS, FOLDER_COLOR_KEYS } from "@/utils/folderColors";
import type { NoteInfo, SearchResult, StikSettings } from "@/types";

const AUTOSAVE_DELAY_MS = 600;
const SEARCH_DELAY_MS = 180;
const PINNED_KEY = "stik.editor.pinned";
const EXPANDED_KEY = "stik.editor.expanded";
const ARCHIVE_FOLDER = "Archive";
const ICONS: Record<string, React.ReactNode> = {
  folder: <path d="M3 8a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.4.6L11.8 8H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  doc: (<><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /></>),
  hash: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.8 9.7l5.9-.9Z" />,
  bookmark: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />,
  tag: (<><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z" /><circle cx="7.5" cy="7.5" r="1.3" /></>),
  inbox: (<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13l3.5 7v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5Z" /></>),
  calendar: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>),
  check: (<><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>),
  heart: <path d="M12 20.3 4.7 13a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8A4.6 4.6 0 0 1 19.3 13Z" />,
  zap: <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12Z" />,
  target: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>),
  bulb: (<><path d="M9.5 18h5M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2v.3h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2Z" /></>),
  briefcase: (<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></>),
  code: <path d="m8 9-4 3 4 3M16 9l4 3-4 3M13.5 5l-3 14" />,
  book: (<><path d="M5 4h13a1 1 0 0 1 1 1v12H6a2 2 0 0 0-2 2V6a2 2 0 0 1 1-2Z" /><path d="M4 19a2 2 0 0 0 2 2h13" /></>),
};
const ICON_KEYS = Object.keys(ICONS);

type Row = { path: string; title: string; subtitle: string; created: string };
type TreeNode = { name: string; path: string; children: TreeNode[] };

const ico = "none";

function noteTitle(content: string, filename: string): string {
  const firstLine = content?.split("\n").find((l) => l.trim());
  return firstLine?.replace(/^#+\s*/, "").trim() || filename.replace(/\.md$/, "");
}

function renameInContent(content: string, title: string): string {
  const lines = content.split("\n");
  const idx = lines.findIndex((l) => l.trim() !== "");
  if (idx !== -1 && /^#{1,6}\s/.test(lines[idx])) {
    lines[idx] = lines[idx].replace(/^(#{1,6}\s+).*/, `$1${title}`);
    return lines.join("\n");
  }
  return `# ${title}\n\n${content.replace(/^\n+/, "")}`;
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const seen = new Map<string, TreeNode>();
  for (const path of [...paths].sort()) {
    const parts = path.split("/");
    let parentPath = "";
    let level = root;
    for (const part of parts) {
      const cur = parentPath ? `${parentPath}/${part}` : part;
      let node = seen.get(cur);
      if (!node) {
        node = { name: part, path: cur, children: [] };
        seen.set(cur, node);
        level.push(node);
      }
      level = node.children;
      parentPath = cur;
    }
  }
  return root;
}

// --- icons ---
const Search = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill={ico} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>);
const Plus = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill={ico} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>);
const ChevronDown = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill={ico} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>);
const Caret = ({ open }: { open: boolean }) => (<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" className={`transition-transform ${open ? "rotate-90" : ""}`}><path d="M9 6l6 6-6 6z" /></svg>);
const Dots = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>);
const Palette = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill={ico} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".6" /><circle cx="17.5" cy="10.5" r=".6" /><circle cx="8.5" cy="7.5" r=".6" /><circle cx="6.5" cy="12.5" r=".6" /><path d="M12 2a10 10 0 1 0 0 20h.5a2.5 2.5 0 0 0 0-5H11a2 2 0 0 1 0-4h2a4 4 0 0 0 0-8Z" /></svg>);
const PinIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill={ico} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 10.76V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.76a2 2 0 0 0 .59 1.42L18 14H6l1.41-1.82A2 2 0 0 0 9 10.76Z" /></svg>);
const Pencil = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill={ico} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>);
const ArchiveIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill={ico} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></svg>);
const Trash = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill={ico} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" /></svg>);
const Cog = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill={ico} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);

export default function EditorWindow() {
  const [folders, setFolders] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState("");
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [confirmFolderDelete, setConfirmFolderDelete] = useState<string | null>(null);
  const [folderColors, setFolderColors] = useState<Record<string, string>>({});
  const [folderIcons, setFolderIcons] = useState<Record<string, string>>({});

  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);

  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const editorRef = useRef<EditorRef | null>(null);
  const saveTimer = useRef<number | null>(null);
  const searchTimer = useRef<number | null>(null);

  const loadFolders = useCallback(async (): Promise<string[]> => {
    try {
      const f = await invoke<string[]>("list_folders");
      setFolders(f);
      return f;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    loadFolders().then((f) => setActiveFolder((cur) => cur || f[0] || ""));
    invoke<StikSettings>("get_settings")
      .then((s) => {
        setFolderColors(s.folder_colors || {});
        setFolderIcons(s.folder_icons || {});
      })
      .catch(() => {});
    try {
      setPinned(JSON.parse(localStorage.getItem(PINNED_KEY) || "[]"));
      setExpanded(JSON.parse(localStorage.getItem(EXPANDED_KEY) || "[]"));
    } catch {
      /* ignore */
    }
  }, [loadFolders]);

  const refreshNotes = useCallback(async (folder: string) => {
    if (!folder) return;
    try {
      const list = await invoke<NoteInfo[]>("list_notes", { folder });
      list.sort((a, b) => (a.created < b.created ? 1 : -1));
      setNotes(list);
    } catch {
      setNotes([]);
    }
  }, []);

  useEffect(() => {
    void refreshNotes(activeFolder);
  }, [activeFolder, refreshNotes]);

  useEffect(() => {
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    searchTimer.current = window.setTimeout(async () => {
      try {
        setResults(await invoke<SearchResult[]>("search_notes", { query, folder: activeFolder }));
      } catch {
        setResults([]);
      }
    }, SEARCH_DELAY_MS);
  }, [query, activeFolder]);

  const persistLocal = useCallback((key: string, next: string[], set: (v: string[]) => void) => {
    set(next);
    localStorage.setItem(key, JSON.stringify(next));
  }, []);

  const persistMeta = useCallback(async (colors: Record<string, string>, icons: Record<string, string>) => {
    try {
      const settings = await invoke<StikSettings>("get_settings");
      settings.folder_colors = colors;
      settings.folder_icons = icons;
      await invoke("save_settings", { settings });
    } catch (e) {
      console.error("Failed to save folder appearance:", e);
    }
  }, []);

  const setFolderColor = useCallback(
    (path: string, key: string) => {
      const next = { ...folderColors, [path]: key };
      setFolderColors(next);
      void persistMeta(next, folderIcons);
    },
    [folderColors, folderIcons, persistMeta],
  );

  const setFolderIcon = useCallback(
    (path: string, emoji: string) => {
      const next = { ...folderIcons };
      if (emoji) next[path] = emoji;
      else delete next[path];
      setFolderIcons(next);
      void persistMeta(folderColors, next);
    },
    [folderColors, folderIcons, persistMeta],
  );

  const toggleExpand = useCallback(
    (path: string) => persistLocal(EXPANDED_KEY, expanded.includes(path) ? expanded.filter((p) => p !== path) : [...expanded, path], setExpanded),
    [expanded, persistLocal],
  );

  const openNote = useCallback(async (path: string) => {
    try {
      const text = await invoke<string>("get_note_content", { path });
      setActivePath(path);
      setContent(text);
    } catch (e) {
      console.error("Failed to open note:", e);
    }
  }, []);

  const handleChange = useCallback(
    (next: string) => {
      setContent(next);
      if (!activePath) return;
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        saveTimer.current = null;
        setSaving(true);
        try {
          await invoke("update_note", { path: activePath, content: next });
          void refreshNotes(activeFolder);
        } catch (e) {
          console.error("Autosave failed:", e);
        } finally {
          setSaving(false);
        }
      }, AUTOSAVE_DELAY_MS);
    },
    [activePath, activeFolder, refreshNotes],
  );

  const handleNewNote = useCallback(async () => {
    if (!activeFolder) return;
    const seed = "# Untitled\n\n";
    try {
      const res = await invoke<{ path: string }>("save_note", { folder: activeFolder, content: seed });
      await refreshNotes(activeFolder);
      if (res.path) {
        setActivePath(res.path);
        setContent(seed);
        setTimeout(() => editorRef.current?.focus(), 50);
      }
    } catch (e) {
      console.error("Failed to create note:", e);
    }
  }, [activeFolder, refreshNotes]);

  const commitNewFolder = useCallback(async () => {
    const name = newFolder.trim();
    const parent = addingUnder;
    setAddingUnder(null);
    setNewFolder("");
    if (!name || parent === null) return;
    const full = parent ? `${parent}/${name}` : name;
    try {
      await invoke("create_folder", { name: full });
      await loadFolders();
      if (parent && !expanded.includes(parent)) toggleExpand(parent);
      setActiveFolder(full);
      setFolderMenuOpen(false);
    } catch (e) {
      console.error("Create folder failed:", e);
    }
  }, [newFolder, addingUnder, loadFolders, expanded, toggleExpand]);

  const deleteFolder = useCallback(
    async (path: string) => {
      try {
        await invoke("delete_folder", { name: path });
        const f = await loadFolders();
        if (activeFolder === path || activeFolder.startsWith(`${path}/`)) {
          setActiveFolder(f[0] || "");
        }
        if (activePath && activePath.includes(`/${path}/`)) {
          setActivePath(null);
          setContent("");
        }
        try {
          const s2 = await invoke<StikSettings>("get_settings");
          setFolderColors(s2.folder_colors || {});
          setFolderIcons(s2.folder_icons || {});
        } catch {
          /* ignore */
        }
        setEditingFolder(null);
        setConfirmFolderDelete(null);
      } catch (e) {
        console.error("Delete folder failed:", e);
      }
    },
    [activeFolder, activePath, loadFolders],
  );

  const closeMenus = useCallback(() => {
    setRowMenu(null);
    setConfirmDelete(null);
  }, []);

  const togglePin = useCallback(
    (path: string) => {
      persistLocal(PINNED_KEY, pinned.includes(path) ? pinned.filter((p) => p !== path) : [path, ...pinned], setPinned);
      closeMenus();
    },
    [pinned, persistLocal, closeMenus],
  );

  const startRename = useCallback((path: string, current: string) => {
    setRenaming(path);
    setRenameValue(current);
    closeMenus();
  }, [closeMenus]);

  const commitRename = useCallback(
    async (path: string) => {
      const title = renameValue.trim();
      setRenaming(null);
      if (!title) return;
      try {
        const base = path === activePath ? content : await invoke<string>("get_note_content", { path });
        const updated = renameInContent(base, title);
        await invoke("update_note", { path, content: updated });
        if (path === activePath) {
          setContent(updated);
          editorRef.current?.setContent(updated);
        }
        await refreshNotes(activeFolder);
      } catch (e) {
        console.error("Rename failed:", e);
      }
    },
    [renameValue, activePath, content, activeFolder, refreshNotes],
  );

  const archiveNote = useCallback(
    async (path: string) => {
      closeMenus();
      try {
        await invoke("move_note", { path, targetFolder: ARCHIVE_FOLDER });
        if (path === activePath) {
          setActivePath(null);
          setContent("");
        }
        await loadFolders();
        await refreshNotes(activeFolder);
      } catch (e) {
        console.error("Archive failed:", e);
      }
    },
    [activePath, activeFolder, refreshNotes, loadFolders, closeMenus],
  );

  const deleteNote = useCallback(
    async (path: string) => {
      try {
        await invoke("delete_note", { path });
        if (path === activePath) {
          setActivePath(null);
          setContent("");
        }
        if (pinned.includes(path)) persistLocal(PINNED_KEY, pinned.filter((p) => p !== path), setPinned);
        closeMenus();
        await refreshNotes(activeFolder);
      } catch (e) {
        console.error("Delete failed:", e);
      }
    },
    [activePath, activeFolder, pinned, persistLocal, refreshNotes, closeMenus],
  );

  const searching = query.trim().length > 0;
  const rows: Row[] = searching
    ? results.map((r) => ({ path: r.path, title: r.title || r.filename.replace(/\.md$/, ""), subtitle: r.snippet, created: r.created }))
    : [...notes]
        .sort((a, b) => {
          const ap = pinned.includes(a.path);
          const bp = pinned.includes(b.path);
          if (ap !== bp) return ap ? -1 : 1;
          return a.created < b.created ? 1 : -1;
        })
        .map((n) => ({ path: n.path, title: noteTitle(n.content, n.filename), subtitle: n.content?.replace(/^#+\s*/, "").trim() || "Empty note", created: n.created }));

  const tree = buildTree(folders);

  // Folder glyph: a minimal line icon (tinted by the folder colour) or a coloured dot.
  const glyph = (path: string, size = 14) => {
    const key = folderIcons[path];
    const color = getFolderColor(path, folderColors).dot;
    if (key && ICONS[key]) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          {ICONS[key]}
        </svg>
      );
    }
    return <span className="shrink-0 leading-none" style={{ fontSize: "9px", color }}>●</span>;
  };

  const folderEditor = (path: string, depth: number) => (
    <div className="my-1 mx-1 p-2 rounded-lg bg-line/25" style={{ marginLeft: `${4 + depth * 12}px` }}>
      <div className="flex items-center gap-1.5 mb-2">
        {FOLDER_COLOR_KEYS.map((k) => {
          const active = (folderColors[path] || "coral") === k;
          return (
            <button
              key={k}
              onClick={() => setFolderColor(path, k)}
              className={`w-4 h-4 rounded-full transition-transform ${active ? "ring-2 ring-offset-1 ring-offset-bg ring-ink/40 scale-110" : "hover:scale-110"}`}
              style={{ background: FOLDER_COLORS[k].dot }}
              title={k}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-8 gap-1">
        <button onClick={() => setFolderIcon(path, "")} title="No icon" className={`h-7 flex items-center justify-center rounded text-stone hover:bg-line/60 ${!folderIcons[path] ? "bg-line/60" : ""}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill={ico} stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        {ICON_KEYS.map((k) => (
          <button key={k} onClick={() => setFolderIcon(path, k)} title={k} className={`h-7 flex items-center justify-center rounded hover:bg-line/60 ${folderIcons[path] === k ? "bg-coral/20 text-coral" : "text-ink/80"}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[k]}</svg>
          </button>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-line/40">
        {confirmFolderDelete === path ? (
          <button onClick={() => deleteFolder(path)} className="w-full flex items-center justify-center gap-2 text-[12px] font-medium text-white bg-coral rounded-md py-1.5 transition-colors">
            <Trash /> Delete folder &amp; its notes
          </button>
        ) : (
          <button onClick={() => setConfirmFolderDelete(path)} className="w-full flex items-center gap-2 text-[12px] text-coral hover:bg-coral/10 rounded-md py-1.5 px-2 transition-colors">
            <Trash /> Delete folder
          </button>
        )}
      </div>
    </div>
  );

  const renderTree = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const isOpen = expanded.includes(node.path);
      const isActive = node.path === activeFolder;
      const hasChildren = node.children.length > 0;
      return (
        <div key={node.path}>
          <div className={`group flex items-center gap-1 pr-1 h-7 rounded-md transition-colors ${isActive ? "bg-coral/10" : "hover:bg-line/40"}`} style={{ paddingLeft: `${4 + depth * 12}px` }}>
            <button onClick={() => hasChildren && toggleExpand(node.path)} className={`w-4 h-4 flex items-center justify-center shrink-0 text-stone ${hasChildren ? "" : "invisible"}`}>
              <Caret open={isOpen} />
            </button>
            <button
              onClick={() => {
                setActiveFolder(node.path);
                setFolderMenuOpen(false);
                setEditingFolder(null);
                setQuery("");
              }}
              className="flex-1 min-w-0 flex items-center gap-2 text-left"
            >
              {glyph(node.path)}
              <span className={`truncate text-[13px] ${isActive ? "text-ink font-semibold" : "text-ink/90"}`}>{node.name}</span>
            </button>
            <button onClick={() => { setConfirmFolderDelete(null); setEditingFolder(editingFolder === node.path ? null : node.path); }} title="Colour & icon" className={`w-5 h-5 flex items-center justify-center rounded text-stone hover:text-coral transition-opacity ${editingFolder === node.path ? "opacity-100 text-coral" : "opacity-0 group-hover:opacity-100"}`}>
              <Palette />
            </button>
            <button
              onClick={() => {
                if (!isOpen && hasChildren) toggleExpand(node.path);
                setAddingUnder(node.path);
                setNewFolder("");
              }}
              title="New subfolder"
              className="w-5 h-5 flex items-center justify-center rounded text-stone hover:text-coral opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Plus />
            </button>
          </div>
          {editingFolder === node.path && folderEditor(node.path, depth)}
          {addingUnder === node.path && (
            <input
              autoFocus
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onBlur={commitNewFolder}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNewFolder();
                if (e.key === "Escape") setAddingUnder(null);
              }}
              placeholder="Folder name…"
              className="my-0.5 w-full bg-line/40 rounded-md text-[12px] text-ink outline-none py-1"
              style={{ paddingLeft: `${24 + depth * 12}px` }}
            />
          )}
          {isOpen && hasChildren && renderTree(node.children, depth + 1)}
        </div>
      );
    });

  const MenuItem = ({ onClick, icon, label, danger }: { onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`w-full px-3 py-1.5 flex items-center gap-2.5 text-left text-[13px] transition-colors ${danger ? "text-coral hover:bg-coral hover:text-white" : "text-ink hover:bg-line/50"}`}
    >
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <div className="w-full h-screen flex flex-col bg-bg text-ink overflow-hidden">
      {/* Top bar — drag region; pl clears native traffic lights */}
      <header data-tauri-drag-region className="h-11 shrink-0 flex items-center gap-1 pl-[80px] pr-3 border-b border-line bg-line/20">
        <div data-tauri-drag-region className="flex-1 h-full" />
        <button onClick={() => setSettingsOpen(true)} title="Settings" className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-stone hover:text-ink hover:bg-line/50 transition-colors">
          <Cog />
        </button>
        <button onClick={handleNewNote} title="New note" className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-stone hover:text-coral hover:bg-coral/10 transition-colors">
          <Plus />
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        <aside className="w-[264px] shrink-0 flex flex-col border-r border-line">
          {/* Folder dropdown — one folder at a time */}
          <div className="relative px-2.5 py-2 border-b border-line/70">
            <button onClick={() => setFolderMenuOpen((o) => !o)} className="w-full flex items-center gap-2 px-2.5 h-8 rounded-lg hover:bg-line/40 transition-colors">
              {glyph(activeFolder, 15)}
              <span className="flex-1 min-w-0 truncate text-left text-[13px] font-semibold text-ink">{activeFolder ? activeFolder.split("/").pop() : "Select folder"}</span>
              <span className="text-stone shrink-0"><ChevronDown /></span>
            </button>
            {folderMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => {
                    setFolderMenuOpen(false);
                    setEditingFolder(null);
                    setAddingUnder(null);
                    setConfirmFolderDelete(null);
                  }}
                />
                <div className="absolute left-2.5 right-2.5 top-full mt-1 max-h-[440px] overflow-y-auto scrollbar-hide bg-bg rounded-[10px] shadow-stik border border-line/50 z-20 p-1">
                  {tree.length === 0 ? <p className="px-2 py-2 text-xs text-stone">No folders.</p> : renderTree(tree, 0)}
                  <div className="mt-1 border-t border-line/50 pt-1">
                    {addingUnder === "" ? (
                      <input
                        autoFocus
                        value={newFolder}
                        onChange={(e) => setNewFolder(e.target.value)}
                        onBlur={commitNewFolder}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitNewFolder();
                          if (e.key === "Escape") setAddingUnder(null);
                        }}
                        placeholder="Folder name…"
                        className="w-full bg-line/40 rounded-md text-[12px] text-ink outline-none px-2 py-1.5"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setAddingUnder("");
                          setNewFolder("");
                        }}
                        className="w-full px-2 py-1.5 flex items-center gap-2 text-[13px] text-stone hover:text-coral hover:bg-line/40 rounded-md transition-colors"
                      >
                        <Plus /> New folder
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Search */}
          <div className="px-2.5 py-2 border-b border-line/70">
            <div className="flex items-center gap-2 px-2.5 h-8 rounded-lg bg-line/40 focus-within:bg-line/60 transition-colors">
              <span className="text-stone shrink-0"><Search /></span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes…" className="flex-1 min-w-0 bg-transparent text-[13px] text-ink placeholder:text-stone/60 outline-none" />
              {query && <button onClick={() => setQuery("")} className="text-stone hover:text-ink text-xs shrink-0">✕</button>}
            </div>
          </div>

          {/* Note list */}
          <div className="flex-1 overflow-y-auto scrollbar-hide py-1">
            {rows.length === 0 ? (
              <p className="px-3 py-4 text-xs text-stone">{searching ? "No matches." : "No notes here."}</p>
            ) : (
              rows.map((r) => {
                const isPinned = pinned.includes(r.path);
                const isActive = r.path === activePath;
                return (
                  <div key={r.path} className={`group relative border-l-2 transition-colors ${isActive ? "border-coral bg-coral/5" : "border-transparent hover:bg-line/40"}`}>
                    {renaming === r.path ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(r.path)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(r.path);
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        className="w-full px-3 py-2 bg-transparent text-[13px] font-medium text-ink outline-none border-b border-coral"
                      />
                    ) : (
                      <button onClick={() => openNote(r.path)} className="w-full text-left px-3 py-2 pr-8">
                        <div className="flex items-center gap-1.5">
                          {isPinned && <span className="text-coral/70 shrink-0"><PinIcon /></span>}
                          <span className="truncate text-[13px] font-medium text-ink">{r.title}</span>
                        </div>
                        <div className="truncate text-[11px] text-stone/70 mt-0.5">{r.subtitle}</div>
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(null);
                        setRowMenu((cur) => (cur === r.path ? null : r.path));
                      }}
                      className={`absolute top-2 right-1.5 w-6 h-6 flex items-center justify-center rounded-md text-stone hover:text-ink hover:bg-line/60 transition-all ${rowMenu === r.path ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                    >
                      <Dots />
                    </button>

                    {rowMenu === r.path && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={closeMenus} />
                        <div className="absolute top-8 right-1.5 min-w-[160px] bg-bg rounded-[10px] shadow-stik border border-line/50 overflow-hidden z-20 py-1">
                          <MenuItem onClick={() => togglePin(r.path)} icon={<PinIcon />} label={isPinned ? "Unpin" : "Pin to top"} />
                          <MenuItem onClick={() => startRename(r.path, r.title)} icon={<Pencil />} label="Rename" />
                          <MenuItem onClick={() => archiveNote(r.path)} icon={<ArchiveIcon />} label="Archive" />
                          <div className="my-1 border-t border-line/60" />
                          {confirmDelete === r.path ? (
                            <MenuItem onClick={() => deleteNote(r.path)} icon={<Trash />} label="Click to confirm" danger />
                          ) : (
                            <MenuItem onClick={() => setConfirmDelete(r.path)} icon={<Trash />} label="Delete" danger />
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <footer className="h-[37px] shrink-0 flex items-center px-3 border-t border-line text-[11px] text-stone/60">
            {saving ? "Saving…" : searching ? `${rows.length} matches` : `${rows.length} notes`}
          </footer>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col">
          {activePath ? (
            <Editor key={activePath} ref={editorRef} initialContent={content} onChange={handleChange} placeholder="Start writing…" showFormatToolbar />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-stone">
              <p className="text-sm">Select a note, or create one.</p>
              <button onClick={handleNewNote} className="px-3 py-1.5 text-sm rounded-lg bg-coral/10 text-coral hover:bg-coral/20 transition-colors">+ New note</button>
            </div>
          )}
        </main>
      </div>

      {settingsOpen && (
        <div className="relative z-[200]">
          <SettingsModal isOpen onClose={() => setSettingsOpen(false)} />
        </div>
      )}
    </div>
  );
}

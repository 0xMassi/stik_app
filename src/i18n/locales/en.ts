/// English catalogue — the source of truth for every translatable string.
///
/// Keys are dotted and grouped by surface (`settings.*`, `postit.*`, …).
/// `as const` makes the key union exact, so every other locale is checked
/// against this file at compile time.
///
/// Not everything user-visible belongs here. Proper nouns stay untranslated:
/// theme names (Nord, Dracula), font families (Inter, JetBrains Mono), and
/// brand names (Whisper, iCloud Drive, Discord, GitHub).
export const en = {
  // ── Common ────────────────────────────────────────────────────────
  "common.cancel": "cancel",
  "common.confirm": "confirm",
  "common.esc": "esc",
  "common.enter": "enter",
  "common.tab": "tab",
  "common.opt": "opt",
  "common.loading": "Loading...",
  "common.import": "Import",
  "common.saved": "Saved",
  "common.syncing": "Syncing...",
  "common.linking": "Linking...",
  "common.somethingWentWrong": "Something went wrong",
  "common.justNow": "Just now",
  "date.minAgo": "{count} min ago",
  "date.hoursAgo": "{count}h ago",
  "date.yesterday": "Yesterday",
  "common.delete": "Delete",
  "common.close": "Close",
  "note.failedToLoad": "Failed to load note",
  "sync.syncingWithICloud": "Syncing with iCloud...",
  "sync.syncedWithICloud": "Synced with iCloud",

  // ── Settings — navigation ─────────────────────────────────────────
  "settings.title": "Settings",
  "settings.tab.appearance": "Appearance",
  "settings.tab.shortcuts": "Shortcuts",
  "settings.tab.folders": "Folders",
  "settings.tab.editor": "Editor",
  "settings.tab.templates": "Templates",
  "settings.tab.gitSharing": "Git Sharing",
  "settings.tab.ai": "AI",
  "settings.tab.dictation": "Dictation",
  "settings.tab.insights": "Insights",
  "settings.tab.privacy": "Privacy",
  "settings.onThisDayUnavailable": "Unable to check On This Day",
  "settings.onThisDayNoCheck": "No On This Day check yet",
  "settings.streakUnavailable": "Streak unavailable",

  // ── Settings — language ───────────────────────────────────────────
  "settings.language.title": "Language",
  "settings.language.description":
    "Language used across the Stik interface. Your notes are never translated.",
  "settings.language.system": "Follow system language",

  // ── Settings — appearance ─────────────────────────────────────────
  "settings.theme.name": "Theme name",
  "settings.theme.namePlaceholder": "My Theme",
  "settings.theme.dark": "Dark theme",
  "settings.theme.colors": "Colors",
  "settings.theme.create": "Create custom theme",
  "settings.theme.edit": "Edit theme",
  "settings.theme.export": "Export theme",
  "settings.theme.delete": "Delete theme",
  "settings.theme.deleteConfirm": "Delete theme?",
  "settings.theme.importFile": "Import theme file",
  "settings.theme.files": "Theme files",
  "settings.color.background": "Background",
  "settings.color.surface": "Surface",
  "settings.color.text": "Text",
  "settings.color.mutedText": "Muted text",
  "settings.color.borders": "Borders",
  "settings.color.accent": "Accent",
  "settings.color.accentLight": "Accent light",
  "settings.color.accentDark": "Accent dark",
  "settings.color.highlight": "Highlight",
  "settings.font.editorFont": "Editor Font",
  "settings.font.importFile": "Import font file",
  "settings.font.files": "Font files",
  "settings.font.remove": "Remove font",
  "settings.fontSize": "Font size",

  // ── Settings — editor ─────────────────────────────────────────────
  "settings.vimMode": "Vim mode",
  "settings.vimMode.toggle": "Toggle Vim mode",
  "settings.vim.quickReference": "Quick reference",
  "settings.vim.movement": "Movement",
  "settings.vim.insert": "Insert",
  "settings.vim.edit": "Edit",
  "settings.vim.visual": "Visual",
  "settings.vim.undo": "Undo",
  "settings.vim.commands": "Commands",
  "settings.vim.howToClose": "How to close",
  "settings.textDirection.auto": "Auto (Recommended)",
  "settings.textDirection.ltr": "Left to Right",
  "settings.textDirection.rtl": "Right to Left",

  // ── Settings — folders / storage ──────────────────────────────────
  "settings.notesDirectory": "Notes directory",
  "settings.notesDirectory.choose": "Choose where to store Stik notes",
  "settings.defaultFolder": "Default folder",
  "settings.icloud.title": "iCloud Drive",
  "settings.icloud.toggle": "Toggle iCloud Drive sync",

  // ── Settings — templates ──────────────────────────────────────────
  "settings.template.commandName": "Command name",
  "settings.template.namePlaceholder": "my-template",
  "settings.template.body": "Template body",
  "settings.template.add": "Add template",
  "settings.template.edit": "Edit template",
  "settings.template.delete": "Delete template",
  "settings.template.deleteConfirm": "Delete template?",

  // ── Settings — shortcuts ──────────────────────────────────────────
  "settings.shortcut.add": "Add shortcut",
  "settings.shortcut.remove": "Remove shortcut",
  "settings.shortcut.system": "System shortcuts",
  "settings.shortcut.resetDefault": "Reset to default",
  "settings.shortcut.clickToRecord": "Click to record",

  // ── Settings — window / system ────────────────────────────────────
  "settings.hideDockIcon": "Hide Dock icon",
  "settings.hideDockIcon.toggle": "Toggle Dock icon visibility",
  "settings.hideTrayIcon.toggle": "Toggle menu bar icon visibility",
  "settings.autoUpdate.toggle": "Toggle automatic updates",

  // ── Settings — git sharing ────────────────────────────────────────
  "settings.git.toggle": "Toggle Git sharing",
  "settings.git.remoteUrl": "Remote URL",
  "settings.git.sharedFolder": "Shared folder",
  "settings.git.advanced": "Advanced",
  "settings.git.branch": "Branch",
  "settings.git.pullInterval": "Pull interval",
  "settings.git.layoutSelected": "Selected folder is repo root",
  "settings.git.layoutWhole": "Whole Stik folder is repo root",

  // ── Settings — AI ─────────────────────────────────────────────────
  "settings.ai.toggle": "Toggle AI features",
  "settings.ai.howItWorks": "How it works",
  "settings.ai.semanticSearch": "Semantic search",
  "settings.ai.folderSuggestions": "Folder suggestions",
  "settings.ai.noteEmbeddings": "Note embeddings",
  "settings.ai.privacy": "Privacy",

  // ── Settings — privacy / analytics ────────────────────────────────
  "settings.analytics.toggle": "Toggle anonymous analytics",
  "settings.analytics.collectAppOpens": "App opens (daily active usage)",
  "settings.analytics.collectDevice":
    "Device type (macOS version, CPU architecture)",
  "settings.analytics.collectScreen": "Screen resolution and app version",
  "settings.analytics.collectId": "Anonymous device identifier",
  "settings.analytics.neverNotes": "Your notes, titles, or folder names",
  "settings.analytics.neverPaths": "File paths or personal information",
  "settings.analytics.neverIdentify": "Anything that could identify you",
  "settings.analytics.yourDeviceId": "Your device ID",

  // ── Settings — durations ──────────────────────────────────────────
  "duration.1minute": "1 minute",
  "duration.5minutes": "5 minutes",
  "duration.15minutes": "15 minutes",
  "duration.30minutes": "30 minutes",
  "duration.1hour": "1 hour",

  // ── Dictation ─────────────────────────────────────────────────────
  "dictation.onDevice": "On-device dictation",
  "dictation.model": "Model",
  "dictation.models": "Models",
  "dictation.selectLanguage": "Select language",

  // ── Spoken languages (dictation targets) ──────────────────────────
  "language.autoDetect": "Auto-detect",
  "language.english": "English",
  "language.italian": "Italian",
  "language.spanish": "Spanish",
  "language.french": "French",
  "language.german": "German",
  "language.portuguese": "Portuguese",
  "language.dutch": "Dutch",
  "language.japanese": "Japanese",
  "language.chinese": "Chinese",
  "language.korean": "Korean",
  "language.russian": "Russian",
  "language.arabic": "Arabic",
  "language.hindi": "Hindi",
  "language.turkish": "Turkish",
  "language.polish": "Polish",
  "language.greek": "Greek",
  "language.czech": "Czech",
  "language.swedish": "Swedish",
  "language.romanian": "Romanian",
  "language.ukrainian": "Ukrainian",

  // ── Post-it ───────────────────────────────────────────────────────
  "postit.pinToScreen": "Pin to screen",
  "postit.actions": "Actions",
  "postit.closeWithoutSaving": "Close without saving",
  "postit.saveAndClose": "Save and close (Esc)",

  // ── Formatting toolbar ────────────────────────────────────────────
  "format.heading": "Heading",
  "format.bold": "Bold",
  "format.italic": "Italic",
  "format.strikethrough": "Strikethrough",
  "format.inlineCode": "Inline code",
  "format.blockquote": "Blockquote",
  "format.bulletList": "Bullet list",
  "format.orderedList": "Ordered list",
  "format.taskList": "Task list",

  // ── Link popover ──────────────────────────────────────────────────
  "link.text": "Text",
  "link.textPlaceholder": "Link text",
  "link.url": "URL",
  "link.openInBrowser": "Open in browser",
  "link.edit": "Edit link",
  "link.remove": "Remove link",

  // ── Tables (editor block widgets) ─────────────────────────────────
  "table.insertRowAbove": "Insert row above",
  "table.insertRowBelow": "Insert row below",
  "table.insertColumnLeft": "Insert column left",
  "table.insertColumnRight": "Insert column right",
  "table.deleteRow": "Delete row",
  "table.deleteColumn": "Delete column",
  "table.addRowBelow": "Add row below",
  "table.addColumnRight": "Add column to the right",
  "heading.unfold": "Unfold",
  "heading.unfoldSection": "Unfold section",
  "heading.foldSection": "Fold section",

  // ── AI menu ───────────────────────────────────────────────────────
  "ai.assistant": "AI Assistant",
  "ai.folder": "Folder:",
  "ai.tags": "Tags:",
  "ai.chooseStyle": "Choose style",

  // ── Command palette / folders ─────────────────────────────────────
  "palette.allFolders": "All Folders",
  "palette.folderNamePlaceholder": "Folder name...",
  "palette.noteTitlePlaceholder": "Note title...",
  "appleNotes.searchPlaceholder": "Search Apple Notes...",

  // ── Misc ──────────────────────────────────────────────────────────
  "lock.lockedNote": "Locked Note",
  "analytics.whatsNew": "What's New",
  "analytics.ifEnjoying": "If you're enjoying Stik, consider:",
} as const;

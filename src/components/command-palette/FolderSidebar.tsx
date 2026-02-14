import type { FolderStats } from "@/types";
import { FOLDER_COLORS, FOLDER_COLOR_KEYS, getFolderColor } from "@/utils/folderColors";

interface FolderSidebarProps {
  folderStats: FolderStats[];
  totalNoteCount: number;
  selectedFolder: string | null;
  folderColors: Record<string, string>;
  focused: boolean;
  isCreating: boolean;
  newFolderName: string;
  newFolderColor: string;
  isRenaming: boolean;
  renameValue: string;
  renamingFolder: string | null;
  onSelectFolder: (folder: string | null) => void;
  onSetNewFolderName: (name: string) => void;
  onSetNewFolderColor: (color: string) => void;
  onCreateFolder: () => void;
  onCancelCreate: () => void;
  onSetRenameValue: (value: string) => void;
  onRenameFolder: () => void;
  onCancelRename: () => void;
}

export default function FolderSidebar({
  folderStats,
  totalNoteCount,
  selectedFolder,
  folderColors,
  focused,
  isCreating,
  newFolderName,
  newFolderColor,
  isRenaming,
  renameValue,
  renamingFolder,
  onSelectFolder,
  onSetNewFolderName,
  onSetNewFolderColor,
  onCreateFolder,
  onCancelCreate,
  onSetRenameValue,
  onRenameFolder,
  onCancelRename,
}: FolderSidebarProps) {
  return (
    <div className="w-[200px] shrink-0 border-r border-line flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto py-1">
        {/* All Folders */}
        <button
          onClick={() => onSelectFolder(null)}
          className={`w-full px-3 py-2 flex items-center gap-2 text-left text-[12px] font-medium transition-colors ${
            selectedFolder === null
              ? focused
                ? "bg-coral text-white"
                : "bg-coral/10 text-coral"
              : "text-ink hover:bg-line/50"
          }`}
        >
          <span className="flex-1">All Folders</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              selectedFolder === null
                ? focused
                  ? "bg-white/20 text-white/90"
                  : "bg-coral/20 text-coral"
                : "bg-line text-stone"
            }`}
          >
            {totalNoteCount}
          </span>
        </button>

        {folderStats.map((folder) => {
          const isSelected = selectedFolder === folder.name;
          const isCurrentlyRenaming = isRenaming && renamingFolder === folder.name;
          const color = getFolderColor(folder.name, folderColors);

          return (
            <div key={folder.name}>
              <button
                onClick={() => onSelectFolder(folder.name)}
                className={`w-full px-3 py-2 flex items-center gap-2 text-left text-[12px] transition-colors ${
                  isSelected
                    ? focused
                      ? "bg-coral text-white"
                      : "bg-coral/10 text-coral"
                    : "text-ink hover:bg-line/50"
                }`}
              >
                <span
                  className="text-[8px]"
                  style={{
                    color:
                      isSelected && focused
                        ? "rgba(255,255,255,0.8)"
                        : color.dot,
                  }}
                >
                  ●
                </span>
                {isCurrentlyRenaming ? (
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => onSetRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onRenameFolder();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        onCancelRename();
                      }
                    }}
                    autoFocus
                    className="flex-1 text-[12px] font-medium bg-white/20 rounded px-1.5 py-0.5 outline-none min-w-0"
                  />
                ) : (
                  <span className="flex-1 font-medium truncate">
                    {folder.name}
                  </span>
                )}
                {!isCurrentlyRenaming && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      isSelected
                        ? focused
                          ? "bg-white/20 text-white/90"
                          : "bg-coral/20 text-coral"
                        : "bg-line text-stone"
                    }`}
                  >
                    {folder.note_count}
                  </span>
                )}
              </button>

              {/* Color picker strip during rename */}
              {isCurrentlyRenaming && (
                <div className="px-3 py-1.5 flex items-center gap-1 bg-line/20 border-b border-line/30">
                  {FOLDER_COLOR_KEYS.map((key) => {
                    const isActive =
                      (folderColors[folder.name] || "coral") === key;
                    return (
                      <button
                        key={key}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetNewFolderColor(key);
                        }}
                        className={`w-4 h-4 rounded-full border-2 transition-all ${
                          isActive
                            ? "border-ink scale-110"
                            : "border-transparent hover:scale-110"
                        }`}
                        style={{ backgroundColor: FOLDER_COLORS[key].dot }}
                        title={key}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create folder input */}
      {isCreating ? (
        <div className="border-t border-line">
          <div className="px-3 py-2 flex items-center gap-2 bg-coral/10">
            <span className="text-coral text-[10px]">+</span>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => onSetNewFolderName(e.target.value)}
              placeholder="Folder name..."
              autoFocus
              className="flex-1 text-[12px] font-medium bg-transparent text-ink placeholder:text-stone outline-none min-w-0"
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCreateFolder();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onCancelCreate();
                }
              }}
            />
          </div>
          <div className="px-3 py-1.5 flex items-center gap-1 bg-line/20">
            {FOLDER_COLOR_KEYS.map((key) => (
              <button
                key={key}
                onClick={(e) => {
                  e.stopPropagation();
                  onSetNewFolderColor(key);
                }}
                className={`w-4 h-4 rounded-full border-2 transition-all ${
                  newFolderColor === key
                    ? "border-ink scale-110"
                    : "border-transparent hover:scale-110"
                }`}
                style={{ backgroundColor: FOLDER_COLORS[key].dot }}
                title={key}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="border-t border-line px-3 py-1.5">
          <button
            onClick={() => onSetNewFolderName("")}
            className="text-[10px] text-stone hover:text-coral transition-colors"
          >
            + New Folder
          </button>
        </div>
      )}
    </div>
  );
}

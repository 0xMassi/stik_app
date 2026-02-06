import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import SettingsContent from "./SettingsContent";
import type { StikSettings } from "@/types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isWindow?: boolean;
}

export default function SettingsModal({ isOpen, onClose, isWindow = false }: SettingsModalProps) {
  const [settings, setSettings] = useState<StikSettings | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      invoke<StikSettings>("get_settings").then(setSettings);
      invoke<string[]>("list_folders").then(setFolders);
    }
  }, [isOpen]);

  // Resume shortcuts when settings closes/unmounts
  useEffect(() => {
    return () => {
      invoke("resume_shortcuts").catch(() => {});
    };
  }, []);

  const handleSave = async () => {
    if (!settings) return;

    setIsSaving(true);
    try {
      await invoke("save_settings", { settings });
      await invoke("reload_shortcuts");
      if (!isWindow) {
        onClose();
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !settings) return null;

  const saveButton = (
    <button
      onClick={async () => {
        await handleSave();
        if (isWindow) {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().close();
        }
      }}
      disabled={isSaving}
      className="px-5 py-2 text-[13px] text-white bg-coral rounded-lg hover:bg-coral/90 transition-colors disabled:opacity-50 flex items-center gap-2"
    >
      {isSaving ? (
        <>
          <span className="animate-spin">↻</span>
          <span>Saving...</span>
        </>
      ) : (
        <>
          <span>✓</span>
          <span>Save</span>
        </>
      )}
    </button>
  );

  const cancelButton = (
    <button
      onClick={async () => {
        if (isWindow) {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().close();
        } else {
          onClose();
        }
      }}
      className="px-5 py-2 text-[13px] text-stone hover:text-ink rounded-lg hover:bg-line transition-colors"
    >
      Cancel
    </button>
  );

  if (isWindow) {
    return (
      <div className="w-full h-full bg-bg rounded-[14px] flex flex-col overflow-hidden">
        <div className="flex items-center px-5 py-4 border-b border-line bg-line/20">
          <div className="flex items-center gap-2.5">
            <span className="text-coral text-lg">⚙</span>
            <h2 className="text-[15px] font-semibold text-ink">Settings</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <SettingsContent settings={settings} folders={folders} onSettingsChange={setSettings} />
        </div>
        <div className="flex items-center justify-end px-5 py-4 border-t border-line bg-line/10">
          <div className="flex items-center gap-3">
            {cancelButton}
            {saveButton}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-bg rounded-[14px] w-[440px] max-h-[500px] flex flex-col shadow-stik overflow-hidden border border-line/50">
        <div className="flex items-center px-5 py-4 border-b border-line bg-line/20">
          <div className="flex items-center gap-2.5">
            <span className="text-coral text-lg">⚙</span>
            <h2 className="text-[15px] font-semibold text-ink">Settings</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <SettingsContent settings={settings} folders={folders} onSettingsChange={setSettings} />
        </div>
        <div className="flex items-center justify-end px-5 py-4 border-t border-line bg-line/10">
          <div className="flex items-center gap-3">
            {cancelButton}
            {saveButton}
          </div>
        </div>
      </div>
    </div>
  );
}

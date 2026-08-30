export type WindowType =
  | "postit"
  | "sticked"
  | "settings"
  | "command-palette"
  | "apple-notes-picker"
  | "editor";

export interface WindowInfo {
  type: WindowType;
  id?: string;
  viewing?: boolean;
}

export function resolveWindowInfo(search: string): WindowInfo {
  const params = new URLSearchParams(search);
  const windowType = params.get("window");

  if (windowType === "sticked") {
    return {
      type: "sticked",
      id: params.get("id") || undefined,
      viewing: params.get("viewing") === "true",
    };
  }

  if (windowType === "settings") return { type: "settings" };
  if (["search", "manager", "command-palette"].includes(windowType ?? "")) {
    return { type: "command-palette" };
  }
  if (windowType === "editor") return { type: "editor" };
  if (windowType === "apple-notes-picker") {
    return { type: "apple-notes-picker" };
  }

  return { type: "postit" };
}

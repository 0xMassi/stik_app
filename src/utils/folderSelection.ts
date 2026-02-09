interface ResolveCaptureFolderArgs {
  requestedFolder?: string;
  defaultFolder?: string;
  availableFolders: string[];
}

function hasFolder(folders: string[], candidate?: string): candidate is string {
  if (!candidate) return false;
  return folders.includes(candidate);
}

export function resolveCaptureFolder({
  requestedFolder,
  defaultFolder,
  availableFolders,
}: ResolveCaptureFolderArgs): string {
  if (hasFolder(availableFolders, requestedFolder)) {
    return requestedFolder;
  }

  if (hasFolder(availableFolders, defaultFolder)) {
    return defaultFolder;
  }

  return availableFolders[0] ?? "";
}

export interface NoteDraft {
  path: string;
  content: string;
}

/** Serialize writes and retain failed/newer drafts until they reach storage. */
export function createNoteSaveQueue(write: (draft: NoteDraft) => Promise<void>) {
  const pending = new Map<string, NoteDraft>();
  let inFlight: Promise<void> | null = null;

  return {
    stage(draft: NoteDraft) {
      pending.set(draft.path, draft);
    },
    flush(): Promise<void> {
      if (inFlight) return inFlight;
      inFlight = (async () => {
        while (pending.size) {
          const draft = pending.values().next().value!;
          await write(draft);
          if (pending.get(draft.path) === draft) pending.delete(draft.path);
        }
      })().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}

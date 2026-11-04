/** Durable backup for media awaiting server acknowledgement. Scoped to this origin. */
export type MediaBackup = {
  id: string;
  attemptId: string;
  kind: "AUDIO" | "SCREEN";
  blob: Blob;
  savedAt: number;
  sessionId: string;
  backend: string;
  submission?: { key: string; payload: Record<string, unknown> };
};
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("oral-media-backups", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("media"))
        request.result.createObjectStore("media", { keyPath: "id" });
      if (!request.result.objectStoreNames.contains("parts"))
        request.result.createObjectStore("parts", {
          keyPath: ["id", "sequence"],
        });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveMediaBackup(row: MediaBackup): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("media", "readwrite");
      tx.objectStore("media").put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? new Error("Không lưu được bản ghi trên máy"));
    });
  } finally {
    db.close();
  }
}
export async function deleteMediaBackup(id: string): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("media", "readwrite");
      tx.objectStore("media").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function listMediaBackups(
  sessionId: string,
  backend: string,
): Promise<MediaBackup[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("media", "readonly");
      const request = tx.objectStore("media").getAll();
      tx.oncomplete = () =>
        resolve(
          (request.result as MediaBackup[]).filter(
            (row) => row.sessionId === sessionId && row.backend === backend,
          ),
        );
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export type RecordingPart = Omit<MediaBackup, "submission"> & {
  sequence: number;
};
export async function saveRecordingPart(part: RecordingPart): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("parts", "readwrite");
      tx.objectStore("parts").put(part);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function listPartialRecordings(
  sessionId: string,
  backend: string,
): Promise<MediaBackup[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("parts", "readonly"),
        req = tx.objectStore("parts").getAll();
      tx.oncomplete = () => {
        const groups = new Map<string, RecordingPart[]>();
        for (const row of req.result as RecordingPart[])
          if (row.sessionId === sessionId && row.backend === backend)
            groups.set(row.id, [...(groups.get(row.id) ?? []), row]);
        resolve(
          [...groups.values()].map((parts) => {
            parts.sort((a, b) => a.sequence - b.sequence);
            return {
              ...parts[0],
              blob: new Blob(
                parts.map((p) => p.blob),
                { type: parts[0].blob.type },
              ),
            };
          }),
        );
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function deleteRecordingParts(id: string): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("parts", "readwrite");
      tx.objectStore("parts").delete(
        IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]),
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

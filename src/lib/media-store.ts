import * as React from "react";
import type { MediaItem } from "@/data/media";

export type SavedOrigin = "downloaded" | "uploaded";

export interface SavedMedia extends MediaItem {
  origin: SavedOrigin;
  addedAt: number;
}

/* ------------------------------------------------------------------
 * Your Media
 *  - Downloads: metadata in localStorage. Their video URLs point at the
 *    provider CDNs, so they stay playable.
 *  - Uploads: the video files themselves in IndexedDB, so they survive
 *    reloads. Object URLs are created per session from the stored blobs.
 * ------------------------------------------------------------------ */

const DOWNLOADS_KEY = "taro.gallery.downloads.v1";
const DB_NAME = "taro-media";
const STORE = "uploads";

function readDownloads(): SavedMedia[] {
  try {
    const raw = localStorage.getItem(DOWNLOADS_KEY);
    const list = raw ? (JSON.parse(raw) as SavedMedia[]) : [];
    // Ignore saved entries that don't have a playable media URL.
    return Array.isArray(list) ? list.filter((m) => Boolean(m.video)) : [];
  } catch {
    return [];
  }
}

function writeDownloads(list: SavedMedia[]) {
  try {
    localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(list));
  } catch {
    /* storage full — the in-memory list still works */
  }
}

interface UploadRecord {
  id: string;
  title: string;
  size: number;
  type: string;
  addedAt: number;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const listUploads = () => withStore<UploadRecord[]>("readonly", (s) => s.getAll() as IDBRequest<UploadRecord[]>);
const putUpload = (rec: UploadRecord) => withStore<IDBValidKey>("readwrite", (s) => s.put(rec));
const deleteUpload = (id: string) => withStore<undefined>("readwrite", (s) => s.delete(id));

const toUpload = (rec: UploadRecord, url: string): SavedMedia => ({
  id: rec.id,
  title: rec.title,
  category: "Nature",
  price: 0,
  rating: 0,
  downloads: 0,
  duration: "—",
  resolution: `${(rec.size / 1048576).toFixed(1)} MB`,
  creator: "You",
  creatorUrl: "",
  pageUrl: "",
  video: url,
  poster: "",
  source: "upload",
  origin: "uploaded",
  addedAt: rec.addedAt,
});

export function useLibrary() {
  const [downloads, setDownloads] = React.useState<SavedMedia[]>(readDownloads);
  const [uploads, setUploads] = React.useState<SavedMedia[]>([]);

  // Load stored uploads once, creating playable object URLs for them.
  React.useEffect(() => {
    let alive = true;
    listUploads()
      .then((records) => {
        const items = [...records]
          .sort((a, b) => b.addedAt - a.addedAt)
          .map((rec) => toUpload(rec, URL.createObjectURL(rec.blob)));
        if (alive) setUploads(items);
      })
      .catch(() => undefined); // IndexedDB unavailable: uploads work for this session only
    return () => {
      alive = false;
    };
  }, []);

  const saveDownload = React.useCallback((item: MediaItem) => {
    setDownloads((prev) => {
      if (prev.some((m) => m.id === item.id)) return prev;
      const next = [{ ...item, origin: "downloaded" as const, addedAt: Date.now() }, ...prev];
      writeDownloads(next);
      return next;
    });
  }, []);

  const addUploads = React.useCallback(async (files: File[]) => {
    const created: SavedMedia[] = [];
    for (const file of files) {
      const rec: UploadRecord = {
        id: `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        title: file.name.replace(/\.[^.]+$/, ""),
        size: file.size,
        type: file.type || "video/mp4",
        addedAt: Date.now(),
        blob: file,
      };
      try {
        await putUpload(rec);
      } catch {
        /* not persisted; still playable this session */
      }
      created.push(toUpload(rec, URL.createObjectURL(file)));
    }
    setUploads((prev) => [...created, ...prev]);
    return created;
  }, []);

  const remove = React.useCallback((id: string) => {
    setDownloads((prev) => {
      const next = prev.filter((m) => m.id !== id);
      writeDownloads(next);
      return next;
    });
    setUploads((prev) => {
      const target = prev.find((m) => m.id === id);
      if (target?.video.startsWith("blob:")) URL.revokeObjectURL(target.video);
      return prev.filter((m) => m.id !== id);
    });
    void deleteUpload(id).catch(() => undefined);
  }, []);

  const hasDownload = React.useCallback((id: string) => downloads.some((m) => m.id === id), [downloads]);

  return { downloads, uploads, saveDownload, addUploads, remove, hasDownload };
}

export type Library = ReturnType<typeof useLibrary>;

/**
 * Torrent Engine Singleton
 * Manages the webtorrent instance that lives for the duration of the server process.
 * All torrent operations go through this module.
 */

import WebTorrent from "webtorrent";
import path from "path";
import os from "os";
import fs from "fs";

export interface TorrentInfo {
  id: string;
  infoHash: string;
  name: string;
  magnetURI: string;
  files: FileInfo[];
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  downloaded: number;
  uploaded: number;
  length: number;
  timeRemaining: number | null;
  status: "downloading" | "seeding" | "paused" | "error";
  addedAt: number;
  savePath: string;
  done: boolean;
}

export interface FileInfo {
  name: string;
  path: string;
  length: number;
  progress: number;
  downloaded: number;
}

// Default download directory
const DEFAULT_DOWNLOAD_DIR = path.join(os.homedir(), "Downloads", "anime-raw");

// Ensure download directory exists
if (!fs.existsSync(DEFAULT_DOWNLOAD_DIR)) {
  fs.mkdirSync(DEFAULT_DOWNLOAD_DIR, { recursive: true });
}

// Common public trackers for anime (Nyaa) & general P2P to speed up peer discovery
const ANNOUNCE_LIST = [
  "http://nyaa.tracker.wf:7777/announce",
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://tracker.openbittorrent.com:80/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.torrent.eu.org:451/announce"
];

const STATE_FILE = path.join(DEFAULT_DOWNLOAD_DIR, ".torrents-state.json");

function saveState() {
  try {
    const map = getTorrentMap();
    const state = Array.from(map.values()).map(t => ({
      id: t.id,
      magnetURI: t.magnetURI,
      paused: t.status === "paused"
    }));
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch (err) {
    console.error("[TorrentEngine] Failed to save state:", err);
  }
}

function restoreState() {
  if (!fs.existsSync(STATE_FILE)) return;
  try {
    const data = fs.readFileSync(STATE_FILE, "utf-8");
    const state = JSON.parse(data);
    const client = getClient();
    const map = getTorrentMap();
    
    for (const t of state) {
      if (t.magnetURI) {
        client.add(t.magnetURI, { path: DEFAULT_DOWNLOAD_DIR, announce: ANNOUNCE_LIST }, (torrent) => {
          if (t.paused) torrent.pause();
          
          const info = buildTorrentInfo(torrent);
          if (t.paused) info.status = "paused";
          map.set(torrent.infoHash, info);
          
          torrent.on("download", () => map.set(torrent.infoHash, buildTorrentInfo(torrent)));
          torrent.on("done", () => {
            map.set(torrent.infoHash, buildTorrentInfo(torrent));
            saveState();
          });
          torrent.on("error", () => {
            const current = map.get(torrent.infoHash);
            if (current) map.set(torrent.infoHash, { ...current, status: "error" });
          });
        });
      }
    }
  } catch (err) {
    console.error("[TorrentEngine] Failed to restore state:", err);
  }
}

// Global singleton — persists across hot reloads in dev via globalThis
const globalForTorrent = globalThis as unknown as {
  _webtorrentClient: WebTorrent.Instance | undefined;
  _torrentMap: Map<string, TorrentInfo> | undefined;
};

function getClient(): WebTorrent.Instance {
  if (!globalForTorrent._webtorrentClient) {
    globalForTorrent._webtorrentClient = new WebTorrent();

    globalForTorrent._webtorrentClient.on("error", (err: Error) => {
      console.error("[TorrentEngine] Client error:", err.message);
    });

    setTimeout(restoreState, 0);
  }
  return globalForTorrent._webtorrentClient;
}

function getTorrentMap(): Map<string, TorrentInfo> {
  if (!globalForTorrent._torrentMap) {
    globalForTorrent._torrentMap = new Map();
  }
  return globalForTorrent._torrentMap;
}

function buildTorrentInfo(torrent: WebTorrent.Torrent): TorrentInfo {
  const map = getTorrentMap();
  const existing = map.get(torrent.infoHash);

  const files: FileInfo[] = torrent.files.map((f) => ({
    name: f.name,
    path: f.path,
    length: f.length,
    progress: f.progress,
    downloaded: Math.floor(f.length * f.progress),
  }));

  return {
    id: torrent.infoHash,
    infoHash: torrent.infoHash,
    name: torrent.name,
    magnetURI: torrent.magnetURI,
    files,
    progress: torrent.progress,
    downloadSpeed: torrent.downloadSpeed,
    uploadSpeed: torrent.uploadSpeed,
    numPeers: torrent.numPeers,
    downloaded: torrent.downloaded,
    uploaded: torrent.uploaded,
    length: torrent.length,
    timeRemaining: torrent.timeRemaining === Infinity ? null : torrent.timeRemaining,
    status: torrent.paused ? "paused" : torrent.done ? "seeding" : "downloading",
    addedAt: existing?.addedAt ?? Date.now(),
    savePath: DEFAULT_DOWNLOAD_DIR,
    done: torrent.done,
  };
}

export function addTorrentFromFile(buffer: Buffer): Promise<TorrentInfo> {
  return new Promise((resolve, reject) => {
    const client = getClient();
    const map = getTorrentMap();

    client.add(buffer, { path: DEFAULT_DOWNLOAD_DIR, announce: ANNOUNCE_LIST }, (torrent: WebTorrent.Torrent) => {
      // Check if already exists
      if (map.has(torrent.infoHash)) {
        resolve(map.get(torrent.infoHash)!);
        return;
      }

      const info = buildTorrentInfo(torrent);
      map.set(torrent.infoHash, info);

      torrent.on("download", () => {
        map.set(torrent.infoHash, buildTorrentInfo(torrent));
      });

      torrent.on("done", () => {
        const updated = buildTorrentInfo(torrent);
        map.set(torrent.infoHash, updated);
      });

      torrent.on("error", (err: Error | string) => {
        const current = map.get(torrent.infoHash);
        if (current) {
          map.set(torrent.infoHash, { ...current, status: "error" });
        }
        console.error("[TorrentEngine] Torrent error:", err);
      });

      saveState();
      resolve(info);
    });

    client.on("error", reject);
  });
}

export function addTorrentFromMagnet(magnetURI: string): Promise<TorrentInfo> {
  return new Promise((resolve, reject) => {
    const client = getClient();
    const map = getTorrentMap();

    client.add(magnetURI, { path: DEFAULT_DOWNLOAD_DIR, announce: ANNOUNCE_LIST }, (torrent: WebTorrent.Torrent) => {
      if (map.has(torrent.infoHash)) {
        resolve(map.get(torrent.infoHash)!);
        return;
      }

      const info = buildTorrentInfo(torrent);
      map.set(torrent.infoHash, info);

      torrent.on("download", () => {
        map.set(torrent.infoHash, buildTorrentInfo(torrent));
      });

      torrent.on("done", () => {
        map.set(torrent.infoHash, buildTorrentInfo(torrent));
      });

      torrent.on("error", (err: Error | string) => {
        const current = map.get(torrent.infoHash);
        if (current) {
          map.set(torrent.infoHash, { ...current, status: "error" });
        }
        console.error("[TorrentEngine] Torrent error:", err);
      });

      saveState();
      resolve(info);
    });

    client.on("error", reject);
  });
}

export function listTorrents(): TorrentInfo[] {
  const client = getClient();
  const map = getTorrentMap();

  // Sync live data
  for (const torrent of client.torrents) {
    map.set(torrent.infoHash, buildTorrentInfo(torrent));
  }

  return Array.from(map.values());
}

export function getTorrent(id: string): TorrentInfo | null {
  const client = getClient();
  const torrent = client.torrents.find((t) => t.infoHash === id);
  if (!torrent) return null;
  return buildTorrentInfo(torrent);
}

export function removeTorrent(id: string, deleteFiles = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = getClient();
    const map = getTorrentMap();
    const torrent = client.torrents.find((t) => t.infoHash === id);

    if (!torrent) {
      map.delete(id);
      resolve();
      return;
    }

    torrent.destroy({ destroyStore: deleteFiles }, (err?: Error) => {
      if (err) reject(err);
      else {
        map.delete(id);
        saveState();
        resolve();
      }
    });
  });
}

export function getDownloadDir(): string {
  return DEFAULT_DOWNLOAD_DIR;
}

export function getAllStats(): { downloadSpeed: number; uploadSpeed: number; activeTorrents: number } {
  const client = getClient();
  return {
    downloadSpeed: client.downloadSpeed,
    uploadSpeed: client.uploadSpeed,
    activeTorrents: client.torrents.length,
  };
}

// Get raw WebTorrent torrent object for streaming
export function getRawTorrent(id: string): WebTorrent.Torrent | null {
  const client = getClient();
  return client.torrents.find((t) => t.infoHash === id) ?? null;
}

export function pauseTorrent(id: string): void {
  const client = getClient();
  const torrent = client.torrents.find((t) => t.infoHash === id);
  if (torrent) {
    torrent.pause();
    const map = getTorrentMap();
    const info = map.get(id);
    if (info) {
      info.status = "paused";
      map.set(id, info);
      saveState();
    }
  }
}

export function resumeTorrent(id: string): void {
  const client = getClient();
  const torrent = client.torrents.find((t) => t.infoHash === id);
  if (torrent) {
    torrent.resume();
    const map = getTorrentMap();
    const info = map.get(id);
    if (info) {
      info.status = torrent.done ? "seeding" : "downloading";
      map.set(id, info);
      saveState();
    }
  }
}

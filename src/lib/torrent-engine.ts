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
const CACHE_DIR = path.join(DEFAULT_DOWNLOAD_DIR, ".torrents-cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

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
        const cachePath = path.join(CACHE_DIR, `${t.id}.torrent`);
        // If we have cached the metadata file, use it directly so it loads instantly without peers!
        const addTarget = fs.existsSync(cachePath) ? cachePath : t.magnetURI;

        client.add(addTarget, { path: DEFAULT_DOWNLOAD_DIR, announce: ANNOUNCE_LIST }, (torrent) => {
          if (t.paused) torrent.pause();
          
          const info = buildTorrentInfo(torrent);
          if (t.paused) info.status = "paused";
          map.set(torrent.infoHash, info);
          
          attachTorrentEvents(torrent, map);
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
  _exceptionHandlerInstalled: boolean | undefined;
};

// Absorb WebTorrent internal errors that fire via uncaughtException.
// These errors (e.g. 'reserve', 'missing') are thrown deep inside WebTorrent's
// bitfield/storage internals during piece negotiation and CANNOT be caught with try-catch.
// They are non-fatal to the download itself — WebTorrent recovers automatically.
//
// IMPORTANT: We use prependListener so our handler runs FIRST, before Next.js's
// own uncaughtException handler (which would corrupt the .next cache if it ran).
function installExceptionHandler() {
  if (globalForTorrent._exceptionHandlerInstalled) return;
  globalForTorrent._exceptionHandlerInstalled = true;

  const isWebtorrentInternalError = (msg: string) =>
    msg.includes("reserve") || msg.includes("missing") || msg.includes("bitfield") || msg.includes("private");

  // prependListener ensures we intercept BEFORE Next.js's handler
  process.prependListener("uncaughtException", (err: Error) => {
    if (isWebtorrentInternalError(err?.message ?? "")) {
      return; // swallow silently — download continues unaffected
    }
    // Let other errors bubble through normally
  });

  process.prependListener("unhandledRejection", (reason) => {
    if (isWebtorrentInternalError(String(reason))) {
      return;
    }
  });
}

function getClient(): WebTorrent.Instance {
  if (!globalForTorrent._webtorrentClient) {
    installExceptionHandler();

    // Limit upload to 100 KB/s to prevent TCP ACK starvation, and increase max connections to 150
    globalForTorrent._webtorrentClient = new WebTorrent({ 
      uploadLimit: 100 * 1024,
      maxConns: 150 
    });

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

  const files: FileInfo[] = torrent.files.map((f) => {
    let prog = 0;
    try {
      prog = f.progress;
    } catch (e) {
      // WebTorrent might throw if internal piece arrays are not fully initialized yet
    }
    return {
      name: f.name,
      path: f.path,
      length: f.length,
      progress: prog,
      downloaded: Math.floor(f.length * prog),
    };
  });

  let progress = 0;
  let downloadSpeed = 0;
  let uploadSpeed = 0;
  let numPeers = 0;
  let downloaded = 0;
  let uploaded = 0;
  let length = 0;
  let done = false;
  let timeRemaining: number | null = null;

  try {
    progress = torrent.progress || 0;
    downloadSpeed = torrent.downloadSpeed || 0;
    uploadSpeed = torrent.uploadSpeed || 0;
    numPeers = torrent.numPeers || 0;
    downloaded = torrent.downloaded || 0;
    uploaded = torrent.uploaded || 0;
    length = torrent.length || 0;
    done = !!torrent.done;
    timeRemaining = torrent.timeRemaining === Infinity ? null : torrent.timeRemaining;
  } catch (e) {
    // Ignore early initialization errors where torrent internals (like pieces) might not be ready
  }

  // Fallback to manual computation if WebTorrent global stats threw an error 
  // (This ensures UI doesn't show 0 B / 0 B when files are already known)
  if (length === 0 && files.length > 0) {
    length = files.reduce((acc, f) => acc + f.length, 0);
  }
  if (downloaded === 0 && files.length > 0) {
    downloaded = files.reduce((acc, f) => acc + f.downloaded, 0);
  }
  if (progress === 0 && length > 0) {
    progress = downloaded / length;
  }

  return {
    id: torrent.infoHash,
    infoHash: torrent.infoHash,
    name: torrent.name,
    magnetURI: torrent.magnetURI,
    files,
    progress,
    downloadSpeed,
    uploadSpeed,
    numPeers,
    downloaded,
    uploaded,
    length,
    timeRemaining,
    status: torrent.paused ? "paused" : done ? "seeding" : "downloading",
    addedAt: existing?.addedAt ?? Date.now(),
    savePath: DEFAULT_DOWNLOAD_DIR,
    done,
  };
}

/**
 * Safely attaches download/done/error event listeners to a torrent.
 * Delays the `download` handler until the storage is ready to avoid
 * 'reserve' / 'missing' uncaughtExceptions from WebTorrent internals.
 */
function attachTorrentEvents(torrent: WebTorrent.Torrent, map: Map<string, TorrentInfo>) {
  torrent.on("ready", () => {
    // After 'ready', the storage is fully initialized — safe to read piece info
    map.set(torrent.infoHash, buildTorrentInfo(torrent));

    // Cache the raw .torrent metadata as soon as it's available
  // This ensures that on Next.js restart, we don't have to wait for peers to send metadata again
  torrent.on("metadata", () => {
    if (torrent.torrentFile) {
      const cachePath = path.join(CACHE_DIR, `${torrent.infoHash}.torrent`);
      fs.writeFileSync(cachePath, torrent.torrentFile);
    }
  });

  torrent.on("download", () => {
      try {
        map.set(torrent.infoHash, buildTorrentInfo(torrent));
      } catch { /* storage not ready yet */ }
    });
  });

  torrent.on("done", () => {
    try {
      const updated = buildTorrentInfo(torrent);
      map.set(torrent.infoHash, updated);
      saveState();
    } catch { /* ignore */ }
  });

  torrent.on("error", (err: Error | string) => {
    const current = map.get(torrent.infoHash);
    if (current) map.set(torrent.infoHash, { ...current, status: "error" });
    console.error("[TorrentEngine] Torrent error:", err);
  });
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
      attachTorrentEvents(torrent, map);

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

    // Check if we have this magnet's metadata cached locally
    let addTarget = magnetURI;
    const match = magnetURI.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
    if (match) {
      const infoHash = match[1].toLowerCase();
      const cachePath = path.join(CACHE_DIR, `${infoHash}.torrent`);
      if (fs.existsSync(cachePath)) {
        addTarget = cachePath;
      }
    }

    client.add(addTarget, { path: DEFAULT_DOWNLOAD_DIR, announce: ANNOUNCE_LIST }, (torrent: WebTorrent.Torrent) => {
      // If we loaded from cache, ensure the magnetURI in the UI remains the original one
      // (WebTorrent might generate a simpler magnet link from the .torrent file)
      if (addTarget !== magnetURI && !torrent.magnetURI) {
         // Fallback if needed, though WebTorrent usually auto-generates it
      }

      if (map.has(torrent.infoHash)) {
        resolve(map.get(torrent.infoHash)!);
        return;
      }

      const info = buildTorrentInfo(torrent);
      // Force the original magnetURI to be saved so we don't lose the user's input
      info.magnetURI = magnetURI; 
      
      map.set(torrent.infoHash, info);
      attachTorrentEvents(torrent, map);

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

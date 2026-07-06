"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import DropZone from "@/components/DropZone";
import TorrentCard from "@/components/TorrentCard";
import StatsBar from "@/components/StatsBar";

interface FileInfo {
  name: string;
  path: string;
  length: number;
  progress: number;
  downloaded: number;
}

interface TorrentInfo {
  id: string;
  name: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  downloaded: number;
  length: number;
  timeRemaining: number | null;
  status: "downloading" | "seeding" | "paused" | "error";
  addedAt: number;
  savePath: string;
  done: boolean;
  files: FileInfo[];
}

interface Stats {
  downloadSpeed: number;
  uploadSpeed: number;
  activeTorrents: number;
}

interface Toast {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

interface StreamModal {
  torrentId: string;
  fileIndex: number;
  fileName: string;
}

export default function Dashboard() {
  const [torrents, setTorrents] = useState<TorrentInfo[]>([]);
  const [stats, setStats] = useState<Stats>({ downloadSpeed: 0, uploadSpeed: 0, activeTorrents: 0 });
  const [downloadDir, setDownloadDir] = useState("~/Downloads/anime-raw");
  const [magnetInput, setMagnetInput] = useState("");
  const [isAddingMagnet, setIsAddingMagnet] = useState(false);
  const [isAddingFile, setIsAddingFile] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [streamModal, setStreamModal] = useState<StreamModal | null>(null);
  const toastCounterRef = useRef(0);
  const sseRef = useRef<EventSource | null>(null);

  // ── Toast helpers ─────────────────────────────────────────────
  const addToast = useCallback((type: Toast["type"], message: string) => {
    const id = ++toastCounterRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // ── SSE: real-time progress ────────────────────────────────────
  useEffect(() => {
    function connectSSE() {
      const es = new EventSource("/api/torrent/progress");
      sseRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setTorrents(data.torrents ?? []);
          setStats(data.stats ?? { downloadSpeed: 0, uploadSpeed: 0, activeTorrents: 0 });
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        // Reconnect after 3 seconds
        setTimeout(connectSSE, 3000);
      };
    }

    connectSSE();

    // Fetch initial data immediately
    fetch("/api/torrent/list")
      .then((r) => r.json())
      .then((data) => {
        setTorrents(data.torrents ?? []);
        setStats(data.stats ?? { downloadSpeed: 0, uploadSpeed: 0, activeTorrents: 0 });
        setDownloadDir(data.downloadDir ?? "~/Downloads/anime-raw");
      })
      .catch(console.error);

    return () => sseRef.current?.close();
  }, []);

  // ── Add torrent files ──────────────────────────────────────────
  const handleFilesDropped = async (files: File[]) => {
    setIsAddingFile(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("torrents", f));

      const res = await fetch("/api/torrent/add", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Failed to add torrent");

      const count = data.torrents?.length ?? 1;
      addToast("success", `✓ Added ${count} torrent${count !== 1 ? "s" : ""}`);
    } catch (err) {
      addToast("error", `✕ ${err instanceof Error ? err.message : "Failed to add torrent"}`);
    } finally {
      setIsAddingFile(false);
    }
  };

  // ── Add magnet link ────────────────────────────────────────────
  const handleAddMagnet = async () => {
    const magnet = magnetInput.trim();
    if (!magnet) return;
    if (!magnet.startsWith("magnet:")) {
      addToast("error", "✕ Invalid magnet link. Must start with magnet:");
      return;
    }

    setIsAddingMagnet(true);
    try {
      const res = await fetch("/api/torrent/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ magnet }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Failed to add magnet");

      setMagnetInput("");
      addToast("success", `✓ Magnet link added — fetching metadata...`);
    } catch (err) {
      addToast("error", `✕ ${err instanceof Error ? err.message : "Failed to add magnet"}`);
    } finally {
      setIsAddingMagnet(false);
    }
  };

  // ── Remove torrent ─────────────────────────────────────────────
  const handleRemove = async (id: string, deleteFiles: boolean) => {
    try {
      const url = `/api/torrent/${id}${deleteFiles ? "?deleteFiles=true" : ""}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setTorrents((prev) => prev.filter((t) => t.id !== id));
      addToast(
        "info",
        deleteFiles ? "🗑 Torrent and files removed" : "🗑 Torrent removed"
      );
    } catch (err) {
      addToast("error", `✕ ${err instanceof Error ? err.message : "Failed to remove"}`);
    }
  };

  // ── Pause torrent ─────────────────────────────────────────────
  const handlePause = async (id: string) => {
    try {
      const res = await fetch(`/api/torrent/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast("info", "⏸ Torrent paused");
    } catch (err) {
      addToast("error", `✕ ${err instanceof Error ? err.message : "Failed to pause"}`);
    }
  };

  // ── Resume torrent ─────────────────────────────────────────────
  const handleResume = async (id: string) => {
    try {
      const res = await fetch(`/api/torrent/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast("success", "▶ Torrent resumed");
    } catch (err) {
      addToast("error", `✕ ${err instanceof Error ? err.message : "Failed to resume"}`);
    }
  };

  // ── Video stream modal ─────────────────────────────────────────
  const handleStream = (torrentId: string, fileIndex: number, fileName: string) => {
    setStreamModal({ torrentId, fileIndex, fileName });
  };

  const completedTorrents = torrents.filter((t) => t.done).length;

  return (
    <main className="app-wrapper">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-brand">
          <div className="header-logo" aria-hidden="true">🎌</div>
          <div>
            <h1 className="header-title">AniTorrent</h1>
            <p className="header-subtitle">Raw Anime Downloader</p>
          </div>
        </div>
        <div className="header-status">
          <span className="status-dot" />
          Engine running
        </div>
      </header>

      {/* ── Stats Bar ── */}
      <StatsBar
        stats={stats}
        downloadDir={downloadDir}
        totalTorrents={torrents.length}
        completedTorrents={completedTorrents}
      />

      {/* ── Add Torrent Panel ── */}
      <div className="add-panel">
        <p className="section-title">Add Torrent</p>

        <DropZone onFilesDropped={handleFilesDropped} isLoading={isAddingFile} />

        <div className="divider">or paste magnet link</div>

        <div className="magnet-input-row">
          <input
            id="magnet-input"
            type="text"
            className="magnet-input"
            placeholder="magnet:?xt=urn:btih:..."
            value={magnetInput}
            onChange={(e) => setMagnetInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddMagnet()}
            disabled={isAddingMagnet}
            aria-label="Magnet link input"
          />
          <button
            id="btn-add-magnet"
            className="btn btn-primary"
            onClick={handleAddMagnet}
            disabled={isAddingMagnet || !magnetInput.trim()}
          >
            {isAddingMagnet ? (
              <>
                <span className="spinner" />
                Adding...
              </>
            ) : (
              <>🧲 Add Magnet</>
            )}
          </button>
        </div>
      </div>

      {/* ── Torrent List ── */}
      <p className="section-title">
        Active Downloads
        {torrents.length > 0 && (
          <span style={{ color: "var(--accent-secondary)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
            {torrents.length}
          </span>
        )}
      </p>

      {torrents.length === 0 ? (
        <div className="empty-state" role="status">
          <span className="empty-icon">📡</span>
          <p className="empty-title">No active torrents</p>
          <p className="empty-desc">
            Drop a .torrent file above or paste a magnet link<br />
            to start downloading raw anime episodes
          </p>
        </div>
      ) : (
        <div className="torrent-list" role="list">
          {torrents.map((torrent) => (
            <TorrentCard
              key={torrent.id}
              torrent={torrent}
              onRemove={handleRemove}
              onPause={handlePause}
              onResume={handleResume}
              onStream={handleStream}
            />
          ))}
        </div>
      )}

      {/* ── Video Stream Modal ── */}
      {streamModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setStreamModal(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Streaming: ${streamModal.fileName}`}
        >
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">▶ {streamModal.fileName}</span>
              <button
                id="btn-close-modal"
                className="btn btn-ghost btn-sm btn-icon"
                onClick={() => setStreamModal(null)}
                aria-label="Close video player"
              >
                ✕
              </button>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              className="video-player"
              controls
              autoPlay
              src={`/api/torrent/${streamModal.torrentId}/stream?file=${streamModal.fileIndex}`}
            />
          </div>
        </div>
      )}

      {/* ── Toast Notifications ── */}
      <div className="toast-container" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            role="alert"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  );
}

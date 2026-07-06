"use client";

import { useState } from "react";

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

interface TorrentCardProps {
  torrent: TorrentInfo;
  onRemove: (id: string, deleteFiles: boolean) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onStream: (torrentId: string, fileIndex: number, fileName: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatETA(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function isVideoFile(name: string): boolean {
  return /\.(mp4|mkv|avi|mov|webm|m4v|flv|wmv)$/i.test(name);
}

function getFileIcon(name: string): string {
  if (isVideoFile(name)) return "🎬";
  if (/\.(srt|ass|ssa|sub|idx)$/i.test(name)) return "💬";
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(name)) return "🖼️";
  if (/\.(mp3|flac|aac|wav)$/i.test(name)) return "🎵";
  return "📄";
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  downloading: "badge-downloading",
  seeding: "badge-seeding",
  paused: "badge-paused",
  error: "badge-error",
};

const STATUS_LABEL: Record<string, string> = {
  downloading: "⬇ Downloading",
  seeding: "✓ Seeding",
  paused: "⏸ Paused",
  error: "✕ Error",
};

export default function TorrentCard({ torrent, onRemove, onPause, onResume, onStream }: TorrentCardProps) {
  const [showFiles, setShowFiles] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pct = Math.round(torrent.progress * 100);

  return (
    <div id={`torrent-${torrent.id.slice(0, 8)}`} className={`torrent-card ${torrent.status}`}>
      {/* Header */}
      <div className="torrent-header">
        <div className="torrent-info">
          <div className="torrent-name" title={torrent.name}>
            {torrent.name || "Loading metadata..."}
          </div>
          <div className="torrent-meta">
            <span className={`badge ${STATUS_BADGE_CLASS[torrent.status] ?? ""}`}>
              {STATUS_LABEL[torrent.status] ?? torrent.status}
            </span>
            <span className="torrent-meta-item">👥 {torrent.numPeers} peers</span>
            <span className="torrent-meta-item">
              {formatBytes(torrent.downloaded)} / {formatBytes(torrent.length)}
            </span>
            {torrent.downloadSpeed > 0 && (
              <span className="torrent-meta-item" style={{ color: "var(--accent-secondary)" }}>
                ↓ {formatSpeed(torrent.downloadSpeed)}
              </span>
            )}
            {torrent.uploadSpeed > 0 && (
              <span className="torrent-meta-item" style={{ color: "var(--color-success)" }}>
                ↑ {formatSpeed(torrent.uploadSpeed)}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="torrent-actions">
          {confirmDelete ? (
            <>
              <button
                id={`btn-confirm-delete-${torrent.id.slice(0, 8)}`}
                className="btn btn-sm btn-danger"
                onClick={() => onRemove(torrent.id, false)}
                title="Remove torrent only"
              >
                Remove
              </button>
              <button
                id={`btn-confirm-delete-files-${torrent.id.slice(0, 8)}`}
                className="btn btn-sm btn-danger"
                onClick={() => onRemove(torrent.id, true)}
                title="Remove and delete files"
              >
                + Files
              </button>
              <button
                id={`btn-cancel-delete-${torrent.id.slice(0, 8)}`}
                className="btn btn-sm btn-ghost"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {torrent.status === "downloading" || torrent.status === "seeding" ? (
                <button
                  id={`btn-pause-${torrent.id.slice(0, 8)}`}
                  className="btn btn-sm btn-ghost btn-icon"
                  onClick={() => onPause(torrent.id)}
                  title="Pause torrent"
                >
                  ⏸
                </button>
              ) : torrent.status === "paused" ? (
                <button
                  id={`btn-resume-${torrent.id.slice(0, 8)}`}
                  className="btn btn-sm btn-ghost btn-icon"
                  onClick={() => onResume(torrent.id)}
                  title="Resume torrent"
                >
                  ▶
                </button>
              ) : null}
              <button
                id={`btn-delete-${torrent.id.slice(0, 8)}`}
                className="btn btn-sm btn-ghost btn-icon"
                onClick={() => setConfirmDelete(true)}
                title="Remove torrent"
              >
                🗑
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="progress-section">
        <div className="progress-bar-wrap">
          <div
            className={`progress-bar-fill ${torrent.done ? "done" : ""}`}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <div className="progress-stats">
          <span className="progress-pct">{pct}%</span>
          <span>
            ETA: {torrent.done ? "Done ✓" : formatETA(torrent.timeRemaining)}
          </span>
        </div>
      </div>

      {/* File List Toggle */}
      {torrent.files && torrent.files.length > 0 && (
        <>
          <button
            id={`btn-files-${torrent.id.slice(0, 8)}`}
            className="file-list-toggle"
            onClick={() => setShowFiles(!showFiles)}
          >
            <span>{showFiles ? "▾" : "▸"}</span>
            {torrent.files.length} file{torrent.files.length !== 1 ? "s" : ""}
            {showFiles ? " (collapse)" : " (expand)"}
          </button>

          {showFiles && (
            <div className="file-list">
              {torrent.files.map((file, idx) => (
                <div key={idx} className="file-item">
                  <span className="file-icon">{getFileIcon(file.name)}</span>
                  <span className="file-name" title={file.name}>
                    {file.name}
                  </span>
                  <span className="file-size">{formatBytes(file.length)}</span>
                  {isVideoFile(file.name) && (
                    <button
                      id={`btn-stream-${torrent.id.slice(0, 8)}-${idx}`}
                      className="btn btn-sm btn-ghost file-stream-btn"
                      onClick={() => onStream(torrent.id, idx, file.name)}
                      title="Stream in browser"
                    >
                      ▶ Play
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

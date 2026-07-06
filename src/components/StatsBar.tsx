"use client";

interface Stats {
  downloadSpeed: number;
  uploadSpeed: number;
  activeTorrents: number;
}

interface StatsBarProps {
  stats: Stats;
  downloadDir: string;
  totalTorrents: number;
  completedTorrents: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function StatsBar({ stats, downloadDir, totalTorrents, completedTorrents }: StatsBarProps) {
  return (
    <div className="stats-bar" role="region" aria-label="Download statistics">
      <div id="stat-download-speed" className="stat-card">
        <div className="stat-label">Download Speed</div>
        <div className="stat-value accent">
          {formatBytes(stats.downloadSpeed)}/s
        </div>
        <span className="stat-icon">⬇</span>
      </div>

      <div id="stat-upload-speed" className="stat-card">
        <div className="stat-label">Upload Speed</div>
        <div className="stat-value">{formatBytes(stats.uploadSpeed)}/s</div>
        <span className="stat-icon">⬆</span>
      </div>

      <div id="stat-active" className="stat-card">
        <div className="stat-label">Active Torrents</div>
        <div className="stat-value">
          {stats.activeTorrents}
          {totalTorrents > 0 && (
            <span style={{ fontSize: "13px", color: "var(--color-success)", marginLeft: "6px" }}>
              ({completedTorrents} done)
            </span>
          )}
        </div>
        <span className="stat-icon">🌀</span>
      </div>

      <div id="stat-save-dir" className="stat-card">
        <div className="stat-label">Save Location</div>
        <div
          className="stat-value"
          style={{
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--text-secondary)",
            wordBreak: "break-all",
            whiteSpace: "normal",
            lineHeight: "1.4",
          }}
          title={downloadDir}
        >
          {downloadDir.replace(/^\/Users\/[^/]+/, "~")}
        </div>
        <span className="stat-icon">📁</span>
      </div>
    </div>
  );
}

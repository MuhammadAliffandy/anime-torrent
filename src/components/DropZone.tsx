"use client";

import { useRef, useState } from "react";

interface DropZoneProps {
  onFilesDropped: (files: File[]) => void;
  isLoading: boolean;
}

export default function DropZone({ onFilesDropped, isLoading }: DropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.endsWith(".torrent")
    );
    if (files.length > 0) onFilesDropped(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) =>
      f.name.endsWith(".torrent")
    );
    if (files.length > 0) onFilesDropped(files);
    // Reset so same file can be re-added
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      id="dropzone"
      className={`dropzone ${isDragActive ? "active" : ""}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => !isLoading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".torrent"
        multiple
        onChange={handleFileInput}
        style={{ display: "none" }}
        id="torrent-file-input"
        aria-label="Upload torrent files"
      />

      {isLoading ? (
        <>
          <span className="dropzone-icon">⏳</span>
          <p className="dropzone-text">Adding torrents...</p>
          <p className="dropzone-hint">Please wait</p>
        </>
      ) : isDragActive ? (
        <>
          <span className="dropzone-icon">📂</span>
          <p className="dropzone-text">Drop your .torrent files here!</p>
          <p className="dropzone-hint">Release to add</p>
        </>
      ) : (
        <>
          <span className="dropzone-icon">🎌</span>
          <p className="dropzone-text">Drag & drop .torrent files here</p>
          <p className="dropzone-hint">
            or <span>click to browse</span> — supports multiple files at once
          </p>
        </>
      )}
    </div>
  );
}

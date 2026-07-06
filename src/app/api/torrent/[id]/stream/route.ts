import { NextRequest, NextResponse } from "next/server";
import { getRawTorrent } from "@/lib/torrent-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/torrent/[id]/stream?file=<fileIndex>
 * Streams a video file from an active torrent directly to the browser.
 * Supports HTTP Range requests for seeking in video player.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const url = new URL(request.url);
  const fileIndex = parseInt(url.searchParams.get("file") ?? "0", 10);

  const torrent = getRawTorrent(id);
  if (!torrent) {
    return NextResponse.json({ error: "Torrent not found" }, { status: 404 });
  }

  if (!torrent.files || torrent.files.length === 0) {
    return NextResponse.json({ error: "No files in torrent" }, { status: 404 });
  }

  const file = torrent.files[fileIndex];
  if (!file) {
    return NextResponse.json({ error: "File index out of range" }, { status: 404 });
  }

  const fileLength = file.length;
  const rangeHeader = request.headers.get("range");

  // Determine MIME type
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeTypes: Record<string, string> = {
    mp4: "video/mp4",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    webm: "video/webm",
    m4v: "video/mp4",
  };
  const mimeType = mimeTypes[ext] ?? "application/octet-stream";

  if (rangeHeader) {
    // Parse range header for seeking support
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileLength - 1;
    const chunkSize = end - start + 1;

    const nodeStream = file.createReadStream({ start, end });

    return new NextResponse(nodeStream as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileLength}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": mimeType,
        "Cache-Control": "no-cache",
      },
    });
  }

  // Full file stream (no range)
  const nodeStream = file.createReadStream();
  return new NextResponse(nodeStream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Length": String(fileLength),
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
    },
  });
}

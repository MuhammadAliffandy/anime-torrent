import { NextResponse } from "next/server";
import { listTorrents, getAllStats } from "@/lib/torrent-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/torrent/progress
 * Server-Sent Events stream — pushes torrent progress updates every second.
 * Robust against client disconnects and WASM-mode crashes.
 */
export async function GET() {
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      function sendUpdate() {
        if (closed) {
          if (intervalId) clearInterval(intervalId);
          return;
        }
        try {
          const torrents = listTorrents();
          const stats = getAllStats();
          const data = JSON.stringify({ torrents, stats, ts: Date.now() });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Client disconnected or controller closed — stop the interval
          closed = true;
          if (intervalId) clearInterval(intervalId);
          try { controller.close(); } catch { /* already closed */ }
        }
      }

      // Send immediately on connect
      sendUpdate();
      // Then push updates every second
      intervalId = setInterval(sendUpdate, 1000);
    },
    cancel() {
      // Called when the client disconnects
      closed = true;
      if (intervalId) clearInterval(intervalId);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

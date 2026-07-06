import { NextResponse } from "next/server";
import { listTorrents, getAllStats, getDownloadDir } from "@/lib/torrent-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const torrents = listTorrents();
    const stats = getAllStats();
    const downloadDir = getDownloadDir();

    return NextResponse.json({
      torrents,
      stats,
      downloadDir,
    });
  } catch (error) {
    console.error("[API /torrent/list]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

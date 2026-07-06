import { NextRequest, NextResponse } from "next/server";
import { getTorrent, removeTorrent, pauseTorrent, resumeTorrent } from "@/lib/torrent-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const torrent = getTorrent(id);

  if (!torrent) {
    return NextResponse.json({ error: "Torrent not found" }, { status: 404 });
  }

  return NextResponse.json({ torrent });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const url = new URL(request.url);
  const deleteFiles = url.searchParams.get("deleteFiles") === "true";

  try {
    await removeTorrent(id, deleteFiles);
    return NextResponse.json({ success: true, message: "Torrent removed" });
  } catch (error) {
    console.error("[API /torrent/[id] DELETE]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "pause") {
      pauseTorrent(id);
      return NextResponse.json({ success: true, message: "Torrent paused" });
    } else if (action === "resume") {
      resumeTorrent(id);
      return NextResponse.json({ success: true, message: "Torrent resumed" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[API /torrent/[id] POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

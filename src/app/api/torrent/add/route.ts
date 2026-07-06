import { NextRequest, NextResponse } from "next/server";
import { addTorrentFromFile, addTorrentFromMagnet } from "@/lib/torrent-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // Handle magnet link (JSON body)
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { magnet } = body;

      if (!magnet || typeof magnet !== "string") {
        return NextResponse.json({ error: "Invalid magnet URI" }, { status: 400 });
      }

      if (!magnet.startsWith("magnet:")) {
        return NextResponse.json({ error: "Not a valid magnet link" }, { status: 400 });
      }

      const info = await addTorrentFromMagnet(magnet);
      return NextResponse.json({ success: true, torrent: info });
    }

    // Handle .torrent file upload (multipart/form-data)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const files = formData.getAll("torrents") as File[];

      if (!files || files.length === 0) {
        return NextResponse.json({ error: "No torrent files provided" }, { status: 400 });
      }

      const results = [];
      for (const file of files) {
        if (!file.name.endsWith(".torrent")) {
          continue;
        }
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const info = await addTorrentFromFile(buffer);
        results.push(info);
      }

      return NextResponse.json({ success: true, torrents: results });
    }

    return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
  } catch (error) {
    console.error("[API /torrent/add]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { synthesizeBanglaSpeech } from "@/lib/ai/elder-assistant";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST { text } → audio/wav (12 kHz mono). 503 when speech is unavailable,
 * in which case the client keeps showing the reply as text.
 */
export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const wav = await synthesizeBanglaSpeech(text.trim().slice(0, 400));
    if (!wav) return NextResponse.json({ error: "Speech unavailable" }, { status: 503 });

    return new NextResponse(new Uint8Array(wav), {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" },
    });
  } catch (error: unknown) {
    console.error("[TTS API Error]:", error);
    return NextResponse.json({ error: "Speech failed" }, { status: 500 });
  }
}

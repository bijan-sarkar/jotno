import { NextRequest, NextResponse } from "next/server";
import { runElderAssistant, type AssistantMode } from "@/lib/ai/elder-assistant";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MODES: AssistantMode[] = ["talk", "meter", "food"];

async function readFile(form: FormData, field: string, maxBytes: number) {
  const file = form.get(field);
  if (!(file instanceof Blob) || file.size === 0) return undefined;
  if (file.size > maxBytes) throw new Error(`${field} is too large`);
  // Gemini wants the bare type ("audio/webm"), not "audio/webm;codecs=opus"
  const mimeType = (file.type || "application/octet-stream").split(";")[0];
  return { data: Buffer.from(await file.arrayBuffer()), mimeType };
}

/**
 * POST multipart/form-data: mode (talk|meter|food), audio?, image?, text?, name?
 * Returns { success, data: AssistantResult }
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const mode = MODES.includes(form.get("mode") as AssistantMode) ? (form.get("mode") as AssistantMode) : "talk";
    const audio = await readFile(form, "audio", MAX_AUDIO_BYTES);
    const image = await readFile(form, "image", MAX_IMAGE_BYTES);
    const text = typeof form.get("text") === "string" ? String(form.get("text")).slice(0, 500).trim() : undefined;
    const userName = typeof form.get("name") === "string" ? String(form.get("name")).slice(0, 60) : undefined;

    if (!audio && !image && !text) {
      return NextResponse.json({ success: false, error: "Send audio, an image, or text" }, { status: 400 });
    }

    const data = await runElderAssistant({ mode, audio, image, text: text || undefined, userName });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("too large") ? 413 : 500;
    console.error("[Assistant API Error]:", message);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

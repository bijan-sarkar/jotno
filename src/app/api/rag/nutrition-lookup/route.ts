import { NextRequest, NextResponse } from "next/server";
import { queryNutritionSources } from "@/lib/rag/nutrition-fetcher";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") || searchParams.get("query") || "";

  if (!query.trim()) {
    return NextResponse.json({ error: "Query parameter 'q' is required." }, { status: 400 });
  }

  const results = await queryNutritionSources(query);
  return NextResponse.json({
    success: true,
    query,
    count: results.length,
    data: results,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = body.query || body.q || "";

    if (!query.trim()) {
      return NextResponse.json({ error: "Query string is required." }, { status: 400 });
    }

    const results = await queryNutritionSources(query);
    return NextResponse.json({
      success: true,
      query,
      count: results.length,
      data: results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

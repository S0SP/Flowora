import { NextRequest, NextResponse } from "next/server"
import { fetchGoogleSheetRows } from "@/services/lead-capture"

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams.get("url")
    if (!url) {
      return NextResponse.json({ error: "Google Sheet URL is required" }, { status: 400 })
    }

    const rows = await fetchGoogleSheetRows(url)
    if (!rows || rows.length === 0) {
      return NextResponse.json({ headers: [] })
    }

    // Extract all column headers (keys of the first row object)
    const headers = Object.keys(rows[0]).map(h => h.trim()).filter(Boolean)
    return NextResponse.json({ headers })
  } catch (err: any) {
    console.error("[fetch-sheet-headers GET]", err)
    return NextResponse.json({ error: err.message ?? "Failed to fetch Google Sheet headers" }, { status: 500 })
  }
}

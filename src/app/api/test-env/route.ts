import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "exists" : "missing",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? "exists" : "MISSING!",
    nodeEnv: process.env.NODE_ENV,
  });
}

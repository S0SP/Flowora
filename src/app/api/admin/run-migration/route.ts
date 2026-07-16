/**
 * POST /api/admin/run-migration
 * One-time migration fix: rename custom_field_schemas columns
 * and add missing created_by columns to tags/custom_field_schemas.
 * PROTECTED by CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY check.
 * Remove this route after running once.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  // Simple protection: require secret header
  const secret = req.headers.get("x-migration-secret");
  const expectedSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-8);
  
  if (!secret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await createAdminClient();

  // Check current column names on custom_field_schemas
  const { data: cols } = await admin
    .from("information_schema.columns" as any)
    .select("column_name")
    .eq("table_name", "custom_field_schemas")
    .in("column_name", ["name", "type", "field_name", "field_type", "created_by"]);

  const columnNames = (cols ?? []).map((c: any) => c.column_name);
  
  const results: string[] = [];

  // We need to run raw SQL — use the pg extension via rpc or use the admin client
  // Unfortunately supabase-js doesn't support DDL directly.
  // Use the sql RPC function if available, or return instructions.
  
  results.push(`Current columns found: ${columnNames.join(", ")}`);
  results.push("To fix, please run the following SQL in your Supabase SQL Editor:");
  results.push(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'custom_field_schemas' AND column_name = 'name') THEN
    ALTER TABLE custom_field_schemas RENAME COLUMN name TO field_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'custom_field_schemas' AND column_name = 'type') THEN
    ALTER TABLE custom_field_schemas RENAME COLUMN type TO field_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'custom_field_schemas' AND column_name = 'created_by') THEN
    ALTER TABLE custom_field_schemas ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tags' AND column_name = 'created_by') THEN
    ALTER TABLE tags ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
  `.trim());

  return NextResponse.json({ results, needs_migration: columnNames.includes("name") || !columnNames.includes("field_name") });
}

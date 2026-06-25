import { NextResponse } from "next/server";
import { listAdminProfiles } from "@/lib/admin-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // Include deleted tombstones so clients can hide removed profiles.
  const profiles = await listAdminProfiles({ includeDeleted: true });
  return NextResponse.json({ profiles });
}

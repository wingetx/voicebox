import { NextResponse } from "next/server";
import { listAdminComments } from "@/lib/admin-comment-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // Include deleted tombstones so clients can hide moderated comments.
  const comments = await listAdminComments({ includeDeleted: true });
  return NextResponse.json({ comments });
}

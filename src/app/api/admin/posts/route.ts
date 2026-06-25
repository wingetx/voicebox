import { NextRequest, NextResponse } from "next/server";
import { listAdminPosts, upsertAdminPost } from "@/lib/admin-post-store";
import { isAdminRequest, unauthorizedResponse } from "@/lib/admin-auth";
import type { AdminPostInput } from "@/lib/admin-posts";

function isAuthed(req: NextRequest): boolean {
  return isAdminRequest(req.headers.get("authorization"));
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return unauthorizedResponse();

  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const posts = await listAdminPosts({ includeDeleted });
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return unauthorizedResponse();

  try {
    const body = (await req.json()) as AdminPostInput;
    const post = await upsertAdminPost(body);
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update post moderation.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

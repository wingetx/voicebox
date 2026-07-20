import { NextRequest, NextResponse } from "next/server";
import { listAdminComments, upsertAdminComment } from "@/lib/admin-comment-store";
import { isAdminRequest, unauthorizedResponse } from "@/lib/admin-auth";
import type { AdminCommentInput } from "@/lib/admin-comments";

function isAuthed(req: NextRequest): boolean {
  return isAdminRequest(req.headers.get("authorization"));
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return unauthorizedResponse();

  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const comments = await listAdminComments({ includeDeleted });
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return unauthorizedResponse();

  try {
    const body = (await req.json()) as AdminCommentInput;
    const comment = await upsertAdminComment(body);
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update comment moderation.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

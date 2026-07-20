import { NextRequest, NextResponse } from "next/server";
import { deleteAdminComment, updateAdminComment } from "@/lib/admin-comment-store";
import { isAdminRequest, unauthorizedResponse } from "@/lib/admin-auth";
import type { AdminCommentPatch } from "@/lib/admin-comments";

interface Params {
  params: {
    id: string;
  };
}

function isAuthed(req: NextRequest): boolean {
  return isAdminRequest(req.headers.get("authorization"));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isAuthed(req)) return unauthorizedResponse();

  try {
    const body = (await req.json()) as AdminCommentPatch;
    const comment = await updateAdminComment(params.id, body);
    return NextResponse.json({ comment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update comment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isAuthed(req)) return unauthorizedResponse();

  try {
    const comment = await deleteAdminComment(params.id);
    return NextResponse.json({ comment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to hide comment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

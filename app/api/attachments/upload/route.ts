import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const conversationId = formData.get("conversationId") as string;

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  let kind: "image" | "pdf" | "doc" | "other" = "other";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) kind = "image";
  else if (ext === "pdf") kind = "pdf";
  else if (["doc", "docx", "xls", "xlsx"].includes(ext)) kind = "doc";

  const storagePath = `${user.id}/${Date.now()}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from("attachments")
    .upload(storagePath, buffer, { contentType: file.type });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    storage_path: storagePath,
    filename: file.name,
    mime: file.type,
    kind,
    conversationId,
  });
}

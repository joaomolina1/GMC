import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path é obrigatório" }, { status: 400 });
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { data, error } = await supabase.storage.from("attachments").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Ficheiro não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ url: data.signedUrl });
}

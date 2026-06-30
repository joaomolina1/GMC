import { redirect } from "next/navigation";

export default async function AgentChatRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { id } = await params;
  const { c } = await searchParams;
  redirect(c ? `/agents/${id}?c=${c}` : `/agents/${id}`);
}

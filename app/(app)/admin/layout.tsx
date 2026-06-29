import { redirect } from "next/navigation";
import { getProfile } from "@lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    redirect("/");
  }
  return children;
}

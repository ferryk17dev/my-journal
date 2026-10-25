import "server-only";

import { createClient } from "@/lib/supabase/server";

export type PostEventOption = {
  id: string;
  title: string;
  visibility: "private" | "public";
};

export async function getOwnerPostEventOptions(ownerId: string) {
  const supabase = await createClient();
  return supabase
    .from("events")
    .select("id, title, visibility")
    .eq("user_id", ownerId)
    .order("title", { ascending: true });
}

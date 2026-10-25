import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function isJournalOwner() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("public")
    .rpc("is_journal_owner");

  // Never infer ownership from the presence of an authenticated user. Treat
  // missing function privileges or any RPC failure as a denial.
  return !error && data === true;
}

export async function requireJournalOwner() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  const { data: isOwner, error: ownerError } = await supabase
    .schema("public")
    .rpc("is_journal_owner");

  if (ownerError || isOwner !== true) {
    redirect("/");
  }

  return data.user;
}

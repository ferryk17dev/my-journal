import { createClient } from "@/lib/supabase/server";
import {
  EVENT_ITEM_BUCKET,
  isEventItemStoragePath,
  isOwnerEventItemStoragePath,
} from "@/lib/event-items/storage";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return new Response(null, {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return notFound();

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  let isOwner = false;
  if (user) {
    const { data, error } = await supabase.schema("public").rpc("is_journal_owner");
    isOwner = !error && data === true;
  }

  const { data: item, error: itemError } = await supabase
    .from("event_items")
    .select("id, event_id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (itemError || !item || !isEventItemStoragePath(item.storage_path)) return notFound();

  if (isOwner && user) {
    const { data: event, error } = await supabase
      .from("events")
      .select("id, visibility, user_id")
      .eq("id", item.event_id)
      .maybeSingle();
    if (
      error ||
      !event ||
      event.user_id !== user.id ||
      !isOwnerEventItemStoragePath(item.storage_path, user.id)
    ) {
      return notFound();
    }
  } else {
    const { data: event, error } = await supabase
      .from("events")
      .select("id, visibility")
      .eq("id", item.event_id)
      .maybeSingle();
    if (error || !event || event.visibility !== "public") return notFound();
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(EVENT_ITEM_BUCKET)
    .createSignedUrl(item.storage_path, 5 * 60);
  if (signedError || !signed?.signedUrl) return notFound();

  let storedImage: Response;
  try {
    storedImage = await fetch(signed.signedUrl, { cache: "no-store" });
  } catch {
    return notFound();
  }

  const contentType = storedImage.headers.get("content-type")?.split(";")[0].toLowerCase();
  if (
    !storedImage.ok ||
    !storedImage.body ||
    !contentType ||
    !["image/jpeg", "image/png", "image/webp"].includes(contentType)
  ) {
    return notFound();
  }

  return new Response(storedImage.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

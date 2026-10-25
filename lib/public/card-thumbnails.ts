import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicThumbnail = { src: string; alt: string };

export async function getPublicPostThumbnails(
  supabase: SupabaseClient,
  postIds: string[],
) {
  const thumbnails = new Map<string, PublicThumbnail>();
  if (!postIds.length) return thumbnails;

  const { data } = await supabase
    .from("post_images")
    .select("id, post_id, alt_text, sort_order")
    .in("post_id", postIds)
    .order("post_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  for (const image of data ?? []) {
    if (!thumbnails.has(image.post_id)) {
      thumbnails.set(image.post_id, {
        src: `/api/images/${image.id}`,
        alt: image.alt_text ?? "",
      });
    }
  }
  return thumbnails;
}

export async function getPublicEventThumbnails(
  supabase: SupabaseClient,
  eventIds: string[],
) {
  const thumbnails = new Map<string, PublicThumbnail>();
  if (!eventIds.length) return thumbnails;

  const { data } = await supabase
    .from("event_items")
    .select("id, event_id, title, caption, sort_order")
    .in("event_id", eventIds)
    .order("event_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  for (const item of data ?? []) {
    if (!thumbnails.has(item.event_id)) {
      thumbnails.set(item.event_id, {
        src: `/api/event-item-images/${item.id}`,
        alt: item.title || item.caption,
      });
    }
  }
  return thumbnails;
}

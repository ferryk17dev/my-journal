"use server";

import { randomUUID } from "node:crypto";
import { requireJournalOwner } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";
import { isOwnerImagePath } from "@/lib/posts/images";

const BUCKET = "journal-private";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

type ImageType = { mime: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" };

function detectImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { mime: "image/png", extension: "png" };
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

export async function uploadPostImage(formData: FormData): Promise<{ path?: string; error?: string }> {
  const owner = await requireJournalOwner();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file to upload." };
  if (file.size > MAX_FILE_SIZE) return { error: "Choose an image smaller than 5 MB." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageType(bytes);
  if (!detected || (file.type && file.type !== detected.mime)) {
    return { error: "Use a valid JPEG, PNG, or WebP image." };
  }

  const path = `${owner.id}/posts/${randomUUID()}.${detected.extension}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "300",
    contentType: detected.mime,
    upsert: false,
  });
  if (error) return { error: "The image could not be uploaded. Please try again." };

  return { path };
}

export async function signOwnerPostImage(postId: string, path: string): Promise<string | null> {
  const owner = await requireJournalOwner();
  if (typeof postId !== "string" || !/^[0-9a-f-]{36}$/i.test(postId) ||
      typeof path !== "string" || !isOwnerImagePath(path, owner.id)) return null;
  const supabase = await createClient();
  const { data: post, error: postError } = await supabase.from("posts")
    .select("id, event_id").eq("id", postId).eq("user_id", owner.id).maybeSingle();
  if (postError || !post) return null;
  if (post.event_id) {
    const { data: event, error: eventError } = await supabase.from("events")
      .select("id, visibility").eq("id", post.event_id).eq("user_id", owner.id).maybeSingle();
    if (eventError || !event) return null;
  }
  const { data: image, error: imageError } = await supabase.from("post_images")
    .select("id").eq("post_id", postId).eq("storage_path", path).maybeSingle();
  if (imageError || !image) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 15 * 60);
  return error ? null : data.signedUrl;
}

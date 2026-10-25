import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const EVENT_ITEM_BUCKET = "journal-private";
export const EVENT_ITEM_MAX_FILE_SIZE = 5 * 1024 * 1024;

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export type EventItemImageType = {
  mime: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
};

export function isEventItemStoragePath(path: string) {
  return new RegExp(
    `^${UUID_PATTERN}/event-items/${UUID_PATTERN}\\.(?:jpg|png|webp)$`,
  ).test(path);
}

export function isOwnerEventItemStoragePath(path: string, ownerId: string) {
  return new RegExp(
    `^${ownerId}/event-items/${UUID_PATTERN}\\.(?:jpg|png|webp)$`,
  ).test(path);
}

export function detectEventItemImageType(bytes: Uint8Array): EventItemImageType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

export async function uploadEventItemImage(
  supabase: SupabaseClient,
  ownerId: string,
  file: File,
): Promise<{ path?: string; error?: string }> {
  if (file.size === 0) return { error: "Choose an image file to upload." };
  if (file.size > EVENT_ITEM_MAX_FILE_SIZE) {
    return { error: "Choose an image smaller than 5 MB." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectEventItemImageType(bytes);
  if (!detected || (file.type && file.type !== detected.mime)) {
    return { error: "Use a valid JPEG, PNG, or WebP image." };
  }

  const path = `${ownerId}/event-items/${randomUUID()}.${detected.extension}`;
  const { error } = await supabase.storage.from(EVENT_ITEM_BUCKET).upload(path, file, {
    cacheControl: "300",
    contentType: detected.mime,
    upsert: false,
  });
  if (error) return { error: "The image could not be uploaded. Please try again." };
  return { path };
}

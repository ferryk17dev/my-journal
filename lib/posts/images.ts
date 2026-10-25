import "server-only";

import type { JSONContent } from "@tiptap/core";

export type PostImageReference = { storage_path: string; alt_text: string | null; sort_order: number };

export function collectPostImageReferences(document: JSONContent): PostImageReference[] {
  const references: PostImageReference[] = [];
  const seenPaths = new Set<string>();
  const pending: unknown[] = [document];

  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    const node = value as Record<string, unknown>;
    if (node.type === "journalImage" && node.attrs && typeof node.attrs === "object") {
      const attrs = node.attrs as Record<string, unknown>;
      if (typeof attrs.storagePath === "string" && !seenPaths.has(attrs.storagePath)) {
        seenPaths.add(attrs.storagePath);
        references.push({
          storage_path: attrs.storagePath,
          alt_text: typeof attrs.alt === "string" && attrs.alt.trim() ? attrs.alt.trim() : null,
          sort_order: references.length,
        });
      }
    }
    if (Array.isArray(node.content)) pending.push(...node.content);
  }

  return references;
}

export function isOwnerImagePath(path: string, ownerId: string) {
  return new RegExp(`^${ownerId}/posts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(?:jpg|png|webp)$`).test(path);
}

export function isPostImageStoragePath(path: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/posts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(path);
}

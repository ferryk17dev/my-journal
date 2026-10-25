import { createClient } from "@/lib/supabase/server";
import { collectPostImageReferences, isOwnerImagePath } from "@/lib/posts/images";
import type { JSONContent } from "@tiptap/core";

const BUCKET = "journal-private";
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
    const { data: ownerResult, error: ownerError } = await supabase
      .schema("public")
      .rpc("is_journal_owner");
    isOwner = !ownerError && ownerResult === true;
  }

  const { data: image, error: imageError } = await supabase
    .from("post_images")
    .select("id, post_id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (imageError || !image) return notFound();

  const postResult = isOwner
    ? await supabase.from("posts").select("id, user_id, status, visibility, event_id, content")
        .eq("id", image.post_id).maybeSingle()
    : await supabase.from("posts").select("id, status, visibility, event_id, content")
        .eq("id", image.post_id).maybeSingle();
  const post = postResult.data;
  const postError = postResult.error;
  if (postError || !post || post.id !== image.post_id) return notFound();
  const referencedImages = collectPostImageReferences(post.content as JSONContent);
  if (!referencedImages.some((reference) => reference.storage_path === image.storage_path)) return notFound();

  const postOwnerId: string | null =
    "user_id" in post && typeof post.user_id === "string" ? post.user_id : null;
  const ownerPreview = isOwner && user?.id === postOwnerId;
  let eventVisibility: string | null = null;
  if (post.event_id) {
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, visibility")
      .eq("id", post.event_id)
      .maybeSingle();
    if (eventError || !event) return notFound();
    eventVisibility = event.visibility;
  }
  if (!ownerPreview && (post.status !== "published" || post.visibility !== "public" ||
      (post.event_id !== null && eventVisibility !== "public"))) return notFound();

  if (ownerPreview && postOwnerId && !isOwnerImagePath(image.storage_path, postOwnerId)) return notFound();
  const { data: signed, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(image.storage_path, 5 * 60);
  if (signedError || !signed?.signedUrl) return notFound();

  let storedImage: Response;
  try {
    storedImage = await fetch(signed.signedUrl, { cache: "no-store" });
  } catch {
    return notFound();
  }
  const contentType = storedImage.headers.get("content-type")?.split(";")[0].toLowerCase();
  if (!storedImage.ok || !storedImage.body ||
      !contentType || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
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

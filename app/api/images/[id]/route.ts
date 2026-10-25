import { createClient } from "@/lib/supabase/server";
import { createStorageAdminClient } from "@/lib/supabase/storage-admin";
import { collectPostImageReferences, isOwnerImagePath, isPostImageStoragePath } from "@/lib/posts/images";
import type { JSONContent } from "@tiptap/core";

const BUCKET = "journal-private";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";
export const revalidate = 0;

function notFound() {
  return new Response(null, {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "Surrogate-Control": "no-store",
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
  if (imageError || !image || !isPostImageStoragePath(image.storage_path)) return notFound();

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

  let imageFile: Blob;
  try {
    const storageAdmin = createStorageAdminClient();
    const { data: imagePost, error: imagePostError } = await storageAdmin
      .from("posts")
      .select("user_id")
      .eq("id", post.id)
      .maybeSingle();
    if (
      imagePostError ||
      !imagePost ||
      !isOwnerImagePath(image.storage_path, imagePost.user_id)
    ) {
      return notFound();
    }

    const { data, error } = await storageAdmin.storage
      .from(BUCKET)
      .download(image.storage_path);
    if (error || !data) return notFound();
    imageFile = data;
  } catch {
    return notFound();
  }
  const contentType = imageFile.type.split(";")[0].toLowerCase();
  if (!contentType || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    return notFound();
  }

  return new Response(await imageFile.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "Surrogate-Control": "no-store",
      "Pragma": "no-cache",
      "Expires": "0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

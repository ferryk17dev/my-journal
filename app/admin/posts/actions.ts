"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  postFormSchema,
  postIdSchema,
  type PostFormState,
  type PostFormValues,
} from "@/lib/posts/validation";
import { requireJournalOwner } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";
import { collectPostImageReferences, isOwnerImagePath } from "@/lib/posts/images";

function readPostForm(formData: FormData): Record<keyof PostFormValues, unknown> {
  return {
    title: formData.get("title"),
    slug: formData.get("slug"),
    excerpt: formData.get("excerpt"),
    content: formData.get("content"),
    event_id: formData.get("event_id"),
    status: formData.get("status"),
    visibility: formData.get("visibility"),
  };
}

function formValuesForDisplay(
  values: Record<keyof PostFormValues, unknown>,
): PostFormValues {
  return {
    title: typeof values.title === "string" ? values.title : "",
    slug: typeof values.slug === "string" ? values.slug : "",
    excerpt: typeof values.excerpt === "string" ? values.excerpt : "",
    content: typeof values.content === "string" ? values.content : "",
    event_id: typeof values.event_id === "string" ? values.event_id : "",
    status: typeof values.status === "string" ? values.status : "",
    visibility: typeof values.visibility === "string" ? values.visibility : "",
  };
}

function validationState(
  values: PostFormValues,
  fieldErrors: PostFormState["fieldErrors"],
): PostFormState {
  return {
    message: "Review the highlighted fields and try again.",
    fieldErrors,
    values,
  };
}

function databaseErrorState(code?: string): PostFormState {
  return {
    message:
      code === "23505"
        ? "That slug is already in use. Choose a different slug."
        : "We couldn't save this post. Please try again.",
  };
}

async function validateEventAssociation(
  eventId: string | null,
  ownerId: string,
): Promise<{ visibility: "private" | "public" } | null | "error"> {
  if (!eventId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, visibility")
    .eq("id", eventId)
    .eq("user_id", ownerId)
    .maybeSingle();

  if (error) return "error";
  if (!data) return null;
  return { visibility: data.visibility };
}

function withEventFieldError(
  values: PostFormValues,
  message: string,
): PostFormState {
  return {
    message,
    fieldErrors: { event_id: [message] },
    values,
  };
}

async function registerPostImages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  ownerId: string,
  content: import("@tiptap/core").JSONContent,
) {
  const references = collectPostImageReferences(content);
  if (references.some((image) => !isOwnerImagePath(image.storage_path, ownerId))) return { error: true, newPaths: [] as string[] };
  for (const image of references) {
    const separator = image.storage_path.lastIndexOf("/");
    const directory = image.storage_path.slice(0, separator);
    const fileName = image.storage_path.slice(separator + 1);
    const { data, error } = await supabase.storage.from("journal-private").list(directory, { limit: 1, search: fileName });
    if (error || !data?.some((file) => file.name === fileName)) return { error: true, newPaths: [] as string[] };
  }
  const paths = references.map((image) => image.storage_path);
  const { data: existing, error: existingError } = await supabase.from("post_images")
    .select("post_id, storage_path")
    .in("storage_path", paths.length ? paths : ["00000000-0000-0000-0000-000000000000"]);
  if (existingError) return { error: true, newPaths: [] as string[] };
  if (existing?.some((image) => image.post_id !== postId)) {
    const referencedPaths = new Set((existing ?? []).map((image) => image.storage_path));
    return {
      error: true,
      newPaths: paths.filter((path) => !referencedPaths.has(path)),
    };
  }

  const existingPaths = new Set((existing ?? []).map((image) => image.storage_path));
  const newImages = references.filter((image) => !existingPaths.has(image.storage_path));
  if (newImages.length) {
    const { error } = await supabase.from("post_images").insert(newImages.map((image) => ({ ...image, post_id: postId })));
    if (error) return { error: true, newPaths: newImages.map((image) => image.storage_path) };
  }
  for (const image of references.filter((reference) => existingPaths.has(reference.storage_path))) {
    const { error } = await supabase.from("post_images").update({ alt_text: image.alt_text, sort_order: image.sort_order })
      .eq("post_id", postId).eq("storage_path", image.storage_path);
    if (error) return { error: true, newPaths: newImages.map((item) => item.storage_path) };
  }
  return { error: false, newPaths: newImages.map((image) => image.storage_path) };
}

async function cleanupRemovedPostImages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  ownerId: string,
  content: import("@tiptap/core").JSONContent,
) {
  const retained = collectPostImageReferences(content).map((image) => image.storage_path);
  const { data: current, error } = await supabase.from("post_images").select("storage_path").eq("post_id", postId);
  if (error) return false;
  if ((current ?? []).some((image) => !isOwnerImagePath(image.storage_path, ownerId))) return false;
  const removed = (current ?? []).map((image) => image.storage_path).filter((path) => !retained.includes(path));
  if (!removed.length) return true;
  const { error: storageError } = await supabase.storage.from("journal-private").remove(removed);
  if (storageError) return false;
  const { error: metadataError } = await supabase.from("post_images").delete().eq("post_id", postId).in("storage_path", removed);
  return !metadataError;
}

async function removeUnreferencedStorageObjects(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[],
) {
  if (!paths.length) return;
  const { data, error } = await supabase.from("post_images")
    .select("storage_path").in("storage_path", paths);
  if (error) return;
  const referenced = new Set((data ?? []).map((image) => image.storage_path));
  const orphaned = paths.filter((path) => !referenced.has(path));
  if (orphaned.length) await supabase.storage.from("journal-private").remove(orphaned);
}

export async function createPost(
  _previousState: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const owner = await requireJournalOwner();
  const rawValues = readPostForm(formData);
  const values = formValuesForDisplay(rawValues);
  const parsed = postFormSchema.safeParse(rawValues);

  if (!parsed.success) {
    return validationState(values, parsed.error.flatten().fieldErrors);
  }

  const event = await validateEventAssociation(parsed.data.event_id, owner.id);
  if (event === "error") {
    return { message: "We couldn't verify the selected event. Please try again." };
  }
  if (parsed.data.event_id && !event) {
    return withEventFieldError(values, "Choose one of your events or make this post standalone.");
  }
  if (
    event?.visibility === "private" &&
    parsed.data.status === "published" &&
    parsed.data.visibility === "public"
  ) {
    return withEventFieldError(
      values,
      "A published public post must use a public event. Posts on private events are hidden from public readers.",
    );
  }

  const supabase = await createClient();
  const { data: createdPost, error } = await supabase.from("posts").insert({
    ...parsed.data,
    content: parsed.data.content,
    published_at:
      parsed.data.status === "published" ? new Date().toISOString() : null,
    user_id: owner.id,
  }).select("id").single();

  if (error) return databaseErrorState(error.code);
  const imageRegistration = await registerPostImages(supabase, createdPost.id, owner.id, parsed.data.content);
  if (imageRegistration.error) {
    await supabase.from("posts").delete().eq("id", createdPost.id).eq("user_id", owner.id);
    await removeUnreferencedStorageObjects(supabase, imageRegistration.newPaths);
    return { message: "We couldn't attach one or more images. Please upload them again and retry." };
  }

  revalidatePath("/admin/posts");
  redirect("/admin/posts");
}

export async function updatePost(
  postId: string,
  _previousState: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const owner = await requireJournalOwner();
  const parsedId = postIdSchema.safeParse(postId);
  if (!parsedId.success) return { message: "This post could not be found." };

  const rawValues = readPostForm(formData);
  const values = formValuesForDisplay(rawValues);
  const parsed = postFormSchema.safeParse(rawValues);
  if (!parsed.success) {
    return validationState(values, parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data: existingPost, error: existingError } = await supabase
    .from("posts")
    .select("id, status, published_at, content")
    .eq("id", parsedId.data)
    .eq("user_id", owner.id)
    .maybeSingle();

  if (existingError) {
    return { message: "We couldn't load the post to save your changes." };
  }
  if (!existingPost) return { message: "This post could not be found." };

  const event = await validateEventAssociation(parsed.data.event_id, owner.id);
  if (event === "error") {
    return { message: "We couldn't verify the selected event. Please try again." };
  }
  if (parsed.data.event_id && !event) {
    return withEventFieldError(values, "Choose one of your events or make this post standalone.");
  }
  if (
    event?.visibility === "private" &&
    parsed.data.status === "published" &&
    parsed.data.visibility === "public"
  ) {
    return withEventFieldError(
      values,
      "A published public post must use a public event. Posts on private events are hidden from public readers.",
    );
  }

  const imageRegistration = await registerPostImages(supabase, parsedId.data, owner.id, parsed.data.content);
  if (imageRegistration.error) {
    if (imageRegistration.newPaths.length) {
      await supabase.from("post_images").delete().eq("post_id", parsedId.data).in("storage_path", imageRegistration.newPaths);
      await removeUnreferencedStorageObjects(supabase, imageRegistration.newPaths);
    }
    return { message: "We couldn't verify the selected images. Please upload them again and retry." };
  }

  const publishedAt =
    parsed.data.status === "draft"
      ? null
      : existingPost.status === "published" && existingPost.published_at
        ? existingPost.published_at
        : new Date().toISOString();

  const { data, error } = await supabase
    .from("posts")
    .update({
      ...parsed.data,
      content: parsed.data.content,
      published_at: publishedAt,
    })
    .eq("id", parsedId.data)
    .eq("user_id", owner.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    if (imageRegistration.newPaths.length) {
      await supabase.from("post_images").delete().eq("post_id", parsedId.data).in("storage_path", imageRegistration.newPaths);
      await removeUnreferencedStorageObjects(supabase, imageRegistration.newPaths);
    }
    return error ? databaseErrorState(error.code) : { message: "This post could not be found or saved." };
  }
  const imagesCleaned = await cleanupRemovedPostImages(supabase, parsedId.data, owner.id, parsed.data.content);
  revalidatePath("/admin/posts");
  revalidatePath(`/admin/posts/${parsedId.data}/edit`);
  if (!imagesCleaned) {
    return { message: "Your post was saved, but removed images still need cleanup. Save again to retry cleanup." };
  }

  redirect("/admin/posts");
}

export async function deletePost(
  postId: string,
  _previousState: PostFormState,
  _formData: FormData,
): Promise<PostFormState> {
  const owner = await requireJournalOwner();
  const parsedId = postIdSchema.safeParse(postId);
  if (!parsedId.success) return { message: "This post could not be found." };

  const supabase = await createClient();
  const { data: imageRows, error: imageQueryError } = await supabase.from("post_images").select("storage_path").eq("post_id", parsedId.data);
  if (imageQueryError) return { message: "We couldn't verify the post's images. Nothing was deleted; please try again." };
  if ((imageRows ?? []).some((image) => !isOwnerImagePath(image.storage_path, owner.id))) {
    return { message: "We couldn't verify the post's images. Nothing was deleted; please contact the site owner." };
  }
  const imagePaths = (imageRows ?? []).map((image) => image.storage_path).filter((path) => isOwnerImagePath(path, owner.id));
  if (imagePaths.length) {
    const { error: storageError } = await supabase.storage.from("journal-private").remove(imagePaths);
    if (storageError) return { message: "The post's images could not be removed. Nothing was deleted; please try again." };
  }
  const { data, error } = await supabase
    .from("posts")
    .delete()
    .eq("id", parsedId.data)
    .eq("user_id", owner.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return { message: "We couldn't delete this post. Please try again." };
  }
  if (!data) return { message: "This post could not be found or deleted." };

  revalidatePath("/admin/posts");
  redirect("/admin/posts");
}

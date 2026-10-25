"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireJournalOwner } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";
import { eventIdSchema } from "@/lib/events/validation";
import {
  eventItemFormSchema,
  eventItemIdSchema,
  eventItemOccurrenceToIso,
  type EventItemActionState,
  type EventItemFormValues,
} from "@/lib/event-items/validation";
import {
  EVENT_ITEM_BUCKET,
  isOwnerEventItemStoragePath,
  uploadEventItemImage,
} from "@/lib/event-items/storage";

function readValues(formData: FormData): EventItemFormValues {
  const readString = (key: keyof EventItemFormValues) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };

  return {
    title: readString("title"),
    caption: readString("caption"),
    occurred_at: readString("occurred_at"),
    sort_order: readString("sort_order"),
  };
}

function validationFailure(
  values: EventItemFormValues,
  fieldErrors: EventItemActionState["fieldErrors"],
): EventItemActionState {
  return {
    status: "error",
    message: "Review the highlighted fields and try again.",
    fieldErrors,
    values,
  };
}

async function getOwnedEvent(eventId: string, ownerId: string) {
  const parsedId = eventIdSchema.safeParse(eventId);
  if (!parsedId.success) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, slug")
    .eq("id", parsedId.data)
    .eq("user_id", ownerId)
    .maybeSingle();

  return error || !data ? null : { supabase, event: data };
}

async function removeUploadedImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
) {
  try {
    const { error } = await supabase.storage.from(EVENT_ITEM_BUCKET).remove([path]);
    return !error;
  } catch {
    return false;
  }
}

function revalidateEvent(eventId: string, slug: string) {
  revalidatePath(`/admin/events/${eventId}/edit`);
  revalidatePath("/admin/events");
  revalidatePath(`/events/${slug}`);
  revalidatePath("/events");
  revalidatePath("/");
}

export async function createEventItem(
  eventId: string,
  _previousState: EventItemActionState,
  formData: FormData,
): Promise<EventItemActionState> {
  const owner = await requireJournalOwner();
  const owned = await getOwnedEvent(eventId, owner.id);
  if (!owned) return { status: "error", message: "This event could not be found." };

  const values = readValues(formData);
  const parsed = eventItemFormSchema.safeParse(values);
  if (!parsed.success) {
    return validationFailure(values, parsed.error.flatten().fieldErrors);
  }

  const imageEntry = formData.get("image");
  if (!(imageEntry instanceof File) || imageEntry.size === 0) {
    return {
      status: "error",
      message: "Choose an image for this Event Item.",
      fieldErrors: { image: ["Choose an image file."] },
      values,
    };
  }

  let uploaded: Awaited<ReturnType<typeof uploadEventItemImage>>;
  try {
    uploaded = await uploadEventItemImage(owned.supabase, owner.id, imageEntry);
  } catch {
    return { status: "error", message: "The image could not be uploaded. Please try again.", values };
  }
  if (!uploaded.path) {
    return {
      status: "error",
      message: uploaded.error ?? "The image could not be uploaded. Please try again.",
      fieldErrors: { image: [uploaded.error ?? "Choose a valid image file."] },
      values,
    };
  }

  let insertFailed = false;
  try {
    const { error } = await owned.supabase.from("event_items").insert({
      event_id: owned.event.id,
      title: parsed.data.title,
      caption: parsed.data.caption,
      occurred_at: eventItemOccurrenceToIso(parsed.data.occurred_at),
      sort_order: parsed.data.sort_order,
      storage_path: uploaded.path,
    });
    insertFailed = Boolean(error);
  } catch {
    insertFailed = true;
  }

  if (insertFailed) {
    const cleaned = await removeUploadedImage(owned.supabase, uploaded.path);
    return {
      status: "error",
      message: cleaned
        ? "The Event Item could not be saved. Please try again."
        : "The Event Item could not be saved, and its uploaded image could not be cleaned up. Please contact the site owner.",
      values,
    };
  }

  revalidateEvent(owned.event.id, owned.event.slug);
  return { status: "success", message: "Event Item added." };
}

export async function updateEventItem(
  eventId: string,
  itemId: string,
  _previousState: EventItemActionState,
  formData: FormData,
): Promise<EventItemActionState> {
  const owner = await requireJournalOwner();
  const owned = await getOwnedEvent(eventId, owner.id);
  const parsedItemId = eventItemIdSchema.safeParse(itemId);
  if (!owned || !parsedItemId.success) {
    return { status: "error", message: "This Event Item could not be found." };
  }

  const { data: item, error: itemError } = await owned.supabase
    .from("event_items")
    .select("id, storage_path")
    .eq("id", parsedItemId.data)
    .eq("event_id", owned.event.id)
    .maybeSingle();
  if (itemError || !item || !isOwnerEventItemStoragePath(item.storage_path, owner.id)) {
    return { status: "error", message: "This Event Item could not be found." };
  }

  const values = readValues(formData);
  const parsed = eventItemFormSchema.safeParse(values);
  if (!parsed.success) {
    return validationFailure(values, parsed.error.flatten().fieldErrors);
  }

  const imageEntry = formData.get("image");
  const replacementFile = imageEntry instanceof File && imageEntry.size > 0 ? imageEntry : null;
  if (imageEntry !== null && !(imageEntry instanceof File)) {
    return {
      status: "error",
      message: "Choose a valid image file.",
      fieldErrors: { image: ["Choose a valid image file."] },
      values,
    };
  }

  let nextPath = item.storage_path;
  if (replacementFile) {
    let uploaded: Awaited<ReturnType<typeof uploadEventItemImage>>;
    try {
      uploaded = await uploadEventItemImage(owned.supabase, owner.id, replacementFile);
    } catch {
      return { status: "error", message: "The image could not be uploaded. Please try again.", values };
    }
    if (!uploaded.path) {
      return {
        status: "error",
        message: uploaded.error ?? "The image could not be uploaded. Please try again.",
        fieldErrors: { image: [uploaded.error ?? "Choose a valid image file."] },
        values,
      };
    }
    nextPath = uploaded.path;
  }

  let updateFailed = false;
  try {
    const { data, error } = await owned.supabase
      .from("event_items")
      .update({
        title: parsed.data.title,
        caption: parsed.data.caption,
        occurred_at: eventItemOccurrenceToIso(parsed.data.occurred_at),
        sort_order: parsed.data.sort_order,
        storage_path: nextPath,
      })
      .eq("id", item.id)
      .eq("event_id", owned.event.id)
      .select("id")
      .maybeSingle();
    updateFailed = Boolean(error || !data);
  } catch {
    updateFailed = true;
  }

  if (updateFailed) {
    if (nextPath !== item.storage_path) {
      const cleaned = await removeUploadedImage(owned.supabase, nextPath);
      return {
        status: "error",
        message: cleaned
          ? "The Event Item could not be saved. Your existing image is unchanged."
          : "The Event Item could not be saved. Your existing image is unchanged, but the new upload could not be cleaned up.",
        values,
      };
    }
    return { status: "error", message: "The Event Item could not be saved. Please try again.", values };
  }

  revalidateEvent(owned.event.id, owned.event.slug);
  if (nextPath !== item.storage_path) {
    const cleaned = await removeUploadedImage(owned.supabase, item.storage_path);
    if (!cleaned) {
      return {
        status: "success",
        message: "Event Item saved. The previous image still needs Storage cleanup.",
      };
    }
  }
  return { status: "success", message: "Event Item saved." };
}

export async function deleteEventItem(
  eventId: string,
  itemId: string,
  _previousState: EventItemActionState,
  _formData: FormData,
): Promise<EventItemActionState> {
  const owner = await requireJournalOwner();
  const owned = await getOwnedEvent(eventId, owner.id);
  const parsedItemId = eventItemIdSchema.safeParse(itemId);
  if (!owned || !parsedItemId.success) {
    return { status: "error", message: "This Event Item could not be found." };
  }

  const { data: item, error: itemError } = await owned.supabase
    .from("event_items")
    .select("id, storage_path")
    .eq("id", parsedItemId.data)
    .eq("event_id", owned.event.id)
    .maybeSingle();
  if (itemError || !item || !isOwnerEventItemStoragePath(item.storage_path, owner.id)) {
    return { status: "error", message: "This Event Item could not be found." };
  }

  let deleteSucceeded = false;
  try {
    const { data, error } = await owned.supabase
      .from("event_items")
      .delete()
      .eq("id", item.id)
      .eq("event_id", owned.event.id)
      .select("id")
      .maybeSingle();
    deleteSucceeded = !error && Boolean(data);
  } catch {
    deleteSucceeded = false;
  }
  if (!deleteSucceeded) {
    return { status: "error", message: "The Event Item could not be deleted. Please try again." };
  }

  revalidateEvent(owned.event.id, owned.event.slug);
  const cleaned = await removeUploadedImage(owned.supabase, item.storage_path);
  redirect(
    `/admin/events/${owned.event.id}/edit?eventItemStatus=${cleaned ? "deleted" : "cleanup-needed"}`,
  );
}

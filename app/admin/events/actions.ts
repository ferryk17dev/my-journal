"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  eventFormSchema,
  eventIdSchema,
  type EventFormState,
  type EventFormValues,
} from "@/lib/events/validation";
import { requireJournalOwner } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";
import { EVENT_ITEM_BUCKET, isOwnerEventItemStoragePath } from "@/lib/event-items/storage";

function readEventForm(formData: FormData): EventFormValues {
  const readString = (name: keyof EventFormValues) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    title: readString("title"),
    slug: readString("slug"),
    description: readString("description"),
    start_date: readString("start_date"),
    end_date: readString("end_date"),
    cover_image_path: readString("cover_image_path"),
    visibility: readString("visibility"),
  };
}

function validationState(
  values: EventFormValues,
  fieldErrors: EventFormState["fieldErrors"],
): EventFormState {
  return {
    message: "Review the highlighted fields and try again.",
    fieldErrors,
    values,
  };
}

function databaseErrorState(errorCode?: string): EventFormState {
  return {
    message:
      errorCode === "23505"
        ? "That slug is already in use. Choose a different slug."
        : "We couldn't save this event. Please try again.",
  };
}

export async function createEvent(
  _previousState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const owner = await requireJournalOwner();
  const values = readEventForm(formData);
  const parsed = eventFormSchema.safeParse(values);

  if (!parsed.success) {
    return validationState(values, parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("events").insert({
    ...parsed.data,
    user_id: owner.id,
  }).select("id").single();

  if (error) {
    return databaseErrorState(error.code);
  }

  revalidatePath("/admin/events");
  redirect(`/admin/events/${data.id}/edit`);
}

export async function updateEvent(
  eventId: string,
  _previousState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  await requireJournalOwner();

  const parsedId = eventIdSchema.safeParse(eventId);
  if (!parsedId.success) {
    return { message: "This event could not be found." };
  }

  const values = readEventForm(formData);
  const parsed = eventFormSchema.safeParse(values);

  if (!parsed.success) {
    return validationState(values, parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .update(parsed.data)
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();

  if (error) {
    return databaseErrorState(error.code);
  }
  if (!data) {
    return { message: "This event could not be found or saved." };
  }

  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${parsedId.data}/edit`);
  redirect("/admin/events");
}

export async function deleteEvent(
  eventId: string,
  _previousState: EventFormState,
  _formData: FormData,
): Promise<EventFormState> {
  const owner = await requireJournalOwner();

  const parsedId = eventIdSchema.safeParse(eventId);
  if (!parsedId.success) {
    return { message: "This event could not be found." };
  }

  const supabase = await createClient();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, slug")
    .eq("id", parsedId.data)
    .eq("user_id", owner.id)
    .maybeSingle();
  if (eventError || !event) {
    return { message: "This event could not be found or deleted." };
  }

  const { data: items, error: itemsError } = await supabase
    .from("event_items")
    .select("storage_path")
    .eq("event_id", event.id);
  if (itemsError || (items ?? []).some((item) => !isOwnerEventItemStoragePath(item.storage_path, owner.id))) {
    return { message: "We couldn't verify this event's images. Nothing was deleted; please try again." };
  }

  const { data, error } = await supabase
    .from("events")
    .delete()
    .eq("id", event.id)
    .eq("user_id", owner.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return { message: "We couldn't delete this event. Please try again." };
  }
  if (!data) {
    return { message: "This event could not be found or deleted." };
  }

  revalidatePath("/admin/events");
  revalidatePath("/events");
  revalidatePath(`/events/${event.slug}`);
  revalidatePath("/");

  let cleanupFailed = false;
  if (items?.length) {
    try {
      const { error: cleanupError } = await supabase.storage
        .from(EVENT_ITEM_BUCKET)
        .remove(items.map((item) => item.storage_path));
      cleanupFailed = Boolean(cleanupError);
    } catch {
      cleanupFailed = true;
    }
  }
  redirect(cleanupFailed ? "/admin/events?itemCleanup=failed" : "/admin/events");
}

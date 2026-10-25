import Link from "next/link";
import { notFound } from "next/navigation";
import { updateEvent } from "@/app/admin/events/actions";
import { DeleteEventForm } from "@/app/admin/events/delete-event-form";
import { EventForm } from "@/app/admin/events/event-form";
import { EventItemsManager } from "@/app/admin/events/event-items-manager";
import { eventIdSchema, type EventFormValues } from "@/lib/events/validation";
import { requireJournalOwner } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ eventItemStatus?: string }>;
}) {
  await requireJournalOwner();
  const { id } = await params;
  const { eventItemStatus } = await searchParams;
  const parsedId = eventIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const supabase = await createClient();
  const { data: event, error } = await supabase
    .from("events")
    .select(
      "id, title, slug, description, start_date, end_date, cover_image_path, visibility",
    )
    .eq("id", parsedId.data)
    .maybeSingle();

  if (error) {
    return (
      <main className="admin-content">
        <p className="form-message" role="alert">
          This event couldn’t be loaded. Please return to the events list and try again.
        </p>
        <Link className="button-secondary" href="/admin/events">Back to events</Link>
      </main>
    );
  }
  if (!event) notFound();

  const { data: eventItems, error: itemsError } = await supabase
    .from("event_items")
    .select("id, title, caption, occurred_at, sort_order, updated_at")
    .eq("event_id", event.id)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  const initialValues: EventFormValues = {
    title: event.title,
    slug: event.slug,
    description: event.description ?? "",
    start_date: event.start_date ?? "",
    end_date: event.end_date ?? "",
    cover_image_path: event.cover_image_path ?? "",
    visibility: event.visibility,
  };
  const updateThisEvent = updateEvent.bind(null, event.id);

  return (
    <main className="admin-content">
      <Link className="back-link" href="/admin/events">← All events</Link>
      <p className="eyebrow">Your journal</p>
      <h1>Edit event</h1>
      <p className="admin-lede">Update the details for “{event.title}”.</p>
      <EventForm
        action={updateThisEvent}
        initialValues={initialValues}
        submitLabel="Save changes"
      />
      <EventItemsManager
        eventId={event.id}
        items={eventItems ?? []}
        loadError={Boolean(itemsError)}
      />
      {eventItemStatus === "deleted" ? (
        <p className="event-item-success event-item-flash" role="status">Event Item deleted.</p>
      ) : eventItemStatus === "cleanup-needed" ? (
        <p className="form-message event-item-flash" role="alert">Event Item deleted, but its image could not be removed from Storage. The private orphan needs cleanup.</p>
      ) : null}
      <section className="edit-delete-section" aria-labelledby="delete-event-heading">
        <h2 id="delete-event-heading">Delete event</h2>
        <p>Deleting this event leaves its associated posts in your journal as standalone posts.</p>
        <DeleteEventForm
          cancelHref={`/admin/events/${event.id}/edit`}
          eventId={event.id}
          eventTitle={event.title}
        />
      </section>
    </main>
  );
}

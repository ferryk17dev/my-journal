import Link from "next/link";
import { DeleteEventForm } from "@/app/admin/events/delete-event-form";
import { requireJournalOwner } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";

function formatDates(startDate: string | null, endDate: string | null) {
  if (startDate && endDate) return `${startDate} – ${endDate}`;
  return startDate ?? endDate ?? "Dates not set";
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ itemCleanup?: string }>;
}) {
  await requireJournalOwner();
  const { itemCleanup } = await searchParams;
  const supabase = await createClient();
  const { data: events, error } = await supabase
    .from("events")
    .select(
      "id, title, slug, description, start_date, end_date, cover_image_path, visibility, created_at, updated_at",
    )
    .order("updated_at", { ascending: false });

  return (
    <main className="admin-content">
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">Your journal</p>
          <h1>Events</h1>
          <p className="admin-lede">Collect posts around trips, seasons, and moments worth keeping.</p>
        </div>
        <Link className="button-primary" href="/admin/events/new">
          New event
        </Link>
      </div>

      {itemCleanup === "failed" ? (
        <p className="form-message" role="alert">
          The event and its items were deleted, but some private images still need Storage cleanup.
        </p>
      ) : null}

      {error ? (
        <p className="form-message" role="alert">
          Events couldn’t be loaded. Please refresh the page and try again.
        </p>
      ) : events?.length ? (
        <ul className="event-list" aria-label="Journal events">
          {events.map((event) => (
            <li key={event.id}>
              <article className="event-card">
                <div className="event-card-main">
                  <div className="event-card-title-row">
                    <h2>
                      <Link href={`/admin/events/${event.id}/edit`}>{event.title}</Link>
                    </h2>
                    <span className={`visibility-badge visibility-${event.visibility}`}>
                      {event.visibility}
                    </span>
                  </div>
                  <p className="event-slug">/{event.slug}</p>
                  <p className="event-dates">{formatDates(event.start_date, event.end_date)}</p>
                  {event.description ? (
                    <p className="event-description">{event.description}</p>
                  ) : null}
                </div>
                <div className="event-card-actions">
                  <Link className="button-secondary" href={`/admin/events/${event.id}/edit`}>
                    Edit
                  </Link>
                  <DeleteEventForm
                    cancelHref="/admin/events"
                    eventId={event.id}
                    eventTitle={event.title}
                  />
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <section className="event-empty" aria-labelledby="empty-events-title">
          <p className="eyebrow">A fresh page</p>
          <h2 id="empty-events-title">No events yet</h2>
          <p>Create your first event to gather related journal entries in one place.</p>
          <Link className="button-primary" href="/admin/events/new">
            Create an event
          </Link>
        </section>
      )}
    </main>
  );
}

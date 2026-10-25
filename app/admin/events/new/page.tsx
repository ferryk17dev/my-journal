import Link from "next/link";
import { createEvent } from "@/app/admin/events/actions";
import { EventForm } from "@/app/admin/events/event-form";
import { requireJournalOwner } from "@/lib/supabase/authorization";

export default async function NewEventPage() {
  await requireJournalOwner();

  return (
    <main className="admin-content">
      <Link className="back-link" href="/admin/events">← All events</Link>
      <p className="eyebrow">Your journal</p>
      <h1>New event</h1>
      <p className="admin-lede">Add the details for this part of your journal.</p>
      <EventForm action={createEvent} submitLabel="Create event" />
    </main>
  );
}

import Link from "next/link";
import { connection } from "next/server";
import {
  PublicEventCard,
  PublicFooter,
  PublicHeader,
} from "@/app/components/public-navigation";
import { createPublicClient } from "@/lib/supabase/public-server";
import { getPublicEventThumbnails } from "@/lib/public/card-thumbnails";
import { tiptapDocumentToPlainText } from "@/lib/posts/content";

export default async function PublicEventsPage() {
  await connection();
  const supabase = createPublicClient();
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, slug, description, summary, start_date, end_date")
    .eq("visibility", "public")
    .order("start_date", { ascending: false, nullsFirst: false });
  const thumbnails = await getPublicEventThumbnails(supabase, events?.map((event) => event.id) ?? []);

  return (
    <div className="public-shell">
      <PublicHeader activePage="events" />
      <main className="shell public-index public-events-index">
        <div className="public-page-heading">
          <p className="eyebrow">The journal, in moments</p>
          <h1>Events</h1>
          <p className="public-lede">Trips, seasons, and the moments that gathered a few stories together.</p>
        </div>

        {error ? (
          <p className="public-empty" role="status">Events are unavailable right now. Please try again soon.</p>
        ) : events?.length ? (
          <div className="public-event-grid public-event-list">
            {events.map((event) => (
              <PublicEventCard
                key={event.slug}
                title={event.title}
                slug={event.slug}
                description={tiptapDocumentToPlainText(event.summary) || event.description}
                startDate={event.start_date}
                endDate={event.end_date}
                thumbnail={thumbnails.get(event.id)}
              />
            ))}
          </div>
        ) : (
          <section className="public-empty-panel">
            <h2>No public events yet</h2>
            <p>New events will appear here when they are ready to share.</p>
            <Link className="text-link" href="/">Return home</Link>
          </section>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

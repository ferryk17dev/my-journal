import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import {
  PublicFooter,
  PublicHeader,
  PublicPostCard,
  formatDateRange,
  formatPublicDateTime,
} from "@/app/components/public-navigation";
import { renderPublicEventSummary } from "@/lib/events/public-summary";
import { getPublicPostThumbnails } from "@/lib/public/card-thumbnails";
import { createPublicClient } from "@/lib/supabase/public-server";

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await connection();
  const supabase = createPublicClient();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title, slug, description, summary, start_date, end_date, visibility")
    .eq("slug", slug)
    .maybeSingle();

  if (eventError || !event || event.visibility !== "public") notFound();

  const { data: eventItems, error: itemsError } = await supabase
    .from("event_items")
    .select("id, title, caption, occurred_at, sort_order")
    .eq("event_id", event.id)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select("id, title, slug, excerpt, published_at")
    .eq("event_id", event.id)
    .eq("status", "published")
    .eq("visibility", "public")
    .order("published_at", { ascending: false });
  const postThumbnails = await getPublicPostThumbnails(supabase, posts?.map((post) => post.id) ?? []);

  const richSummary = renderPublicEventSummary(event.summary);

  return (
    <div className="public-shell">
      <PublicHeader activePage="event-detail" />
      <main className="shell public-index public-event-detail">
        <Link className="back-link" href="/events">← All events</Link>
        <p className="eyebrow">{formatDateRange(event.start_date, event.end_date)}</p>
        <h1>{event.title}</h1>
        {richSummary ? (
          <div className="public-event-summary public-post-content">{richSummary}</div>
        ) : event.description ? (
          <p className="public-event-description">{event.description}</p>
        ) : null}

        <section className="public-event-items" aria-labelledby="event-items-title">
          <div className="public-section-heading public-event-section-heading">
            <div>
              <p className="eyebrow">A visual timeline</p>
              <h2 id="event-items-title">Moments from this event</h2>
            </div>
          </div>
          {itemsError ? (
            <p className="public-empty" role="status">Event moments are unavailable right now.</p>
          ) : eventItems?.length ? (
            <ol className="public-event-timeline" aria-label="Moments in this event">
              {eventItems.map((item) => {
                const occurrenceLabel = formatPublicDateTime(item.occurred_at);
                return (
                  <li className="public-event-timeline-item" key={item.id}>
                    <article className="public-event-timeline-entry">
                      {occurrenceLabel ? (
                        <p className="public-event-timeline-date">
                          <time dateTime={item.occurred_at ?? undefined}>{occurrenceLabel}</time>
                        </p>
                      ) : null}
                      {item.title ? <h3>{item.title}</h3> : null}
                      <img
                        className="public-event-timeline-image"
                        src={`/api/event-item-images/${item.id}`}
                        alt={item.title || item.caption}
                        loading="lazy"
                      />
                      <p className="public-event-timeline-caption">{item.caption}</p>
                    </article>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="public-empty">There are no shared moments for this event yet.</p>
          )}
        </section>

        <section className="public-event-entries" aria-labelledby="event-entries-title">
          <div className="public-section-heading">
            <h2 id="event-entries-title">Stories from this event</h2>
          </div>
          {postsError ? (
            <p className="public-empty" role="status">Entries for this event are unavailable right now.</p>
          ) : posts?.length ? (
            <div className="public-entry-list">
              {posts.map((post) => (
                <PublicPostCard
                  key={post.slug}
                  title={post.title}
                  slug={post.slug}
                  excerpt={post.excerpt}
                  publishedAt={post.published_at}
                  eventTitle={event.title}
                  eventSlug={event.slug}
                  thumbnail={postThumbnails.get(post.id)}
                />
              ))}
            </div>
          ) : (
            <p className="public-empty">There are no public stories for this event yet.</p>
          )}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

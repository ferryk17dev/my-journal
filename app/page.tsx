import Link from "next/link";
import { connection } from "next/server";
import {
  PublicEventCard,
  PublicFooter,
  PublicHeader,
  PublicPostCard,
} from "@/app/components/public-navigation";
import { createPublicClient } from "@/lib/supabase/public-server";
import { getPublicEventThumbnails, getPublicPostThumbnails } from "@/lib/public/card-thumbnails";
import { tiptapDocumentToPlainText } from "@/lib/posts/content";

export default async function HomePage() {
  await connection();
  const supabase = createPublicClient();
  const [postsResult, eventsResult] = await Promise.all([
    supabase
      .from("posts")
      .select("id, title, slug, excerpt, published_at")
      .eq("status", "published")
      .eq("visibility", "public")
      .order("published_at", { ascending: false })
      .limit(3),
    supabase
      .from("events")
      .select("id, title, slug, description, summary, start_date, end_date")
      .eq("visibility", "public")
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(3),
  ]);
  const [postThumbnails, eventThumbnails] = await Promise.all([
    getPublicPostThumbnails(supabase, postsResult.data?.map((post) => post.id) ?? []),
    getPublicEventThumbnails(supabase, eventsResult.data?.map((event) => event.id) ?? []),
  ]);

  return (
    <div className="public-shell">
      <PublicHeader activePage="home" />
      <main className="shell public-home" id="top">
        <section className="public-home-hero" id="about" aria-labelledby="home-title">
          <div className="public-home-hero-heading">
            <p className="eyebrow">A personal journal</p>
            <h1 id="home-title">Small moments,<br />kept close.</h1>
          </div>
          <div className="public-home-hero-copy">
            <p>Stories from the road, notes from ordinary days, and the things worth remembering.</p>
            <Link className="public-primary-link" href="/events">Browse journal events <span aria-hidden="true">→</span></Link>
          </div>
        </section>

        <section className="public-home-section" id="journal" aria-labelledby="journal-title">
          <div className="public-section-heading">
            <div>
              <p className="eyebrow">From the pages</p>
              <h2 id="journal-title">Recent entries</h2>
            </div>
            <Link className="public-section-link" href="/events">Explore the journal <span aria-hidden="true">→</span></Link>
          </div>
          {postsResult.error ? (
            <p className="public-empty" role="status">Journal entries are unavailable right now. Please try again soon.</p>
          ) : postsResult.data?.length ? (
            <div className="public-post-grid">
              {postsResult.data.map((post) => (
                <PublicPostCard
                  key={post.slug}
                  title={post.title}
                  slug={post.slug}
                  excerpt={post.excerpt}
                  publishedAt={post.published_at}
                  thumbnail={postThumbnails.get(post.id)}
                />
              ))}
            </div>
          ) : (
            <p className="public-empty">The first public entries will appear here.</p>
          )}
        </section>

        <section className="public-home-section public-home-events" aria-labelledby="featured-events-title">
          <div className="public-section-heading">
            <div>
              <p className="eyebrow">Gathered moments</p>
              <h2 id="featured-events-title">Events in the journal</h2>
            </div>
            <Link className="public-section-link" href="/events">All events <span aria-hidden="true">→</span></Link>
          </div>
          {eventsResult.error ? (
            <p className="public-empty" role="status">Events are unavailable right now. Please try again soon.</p>
          ) : eventsResult.data?.length ? (
            <div className="public-event-grid">
              {eventsResult.data.map((event) => (
                <PublicEventCard
                  key={event.slug}
                  title={event.title}
                  slug={event.slug}
                  description={tiptapDocumentToPlainText(event.summary) || event.description}
                  startDate={event.start_date}
                  endDate={event.end_date}
                  thumbnail={eventThumbnails.get(event.id)}
                />
              ))}
            </div>
          ) : (
            <p className="public-empty">Public events will appear here when they are ready to share.</p>
          )}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

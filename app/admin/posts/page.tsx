import Link from "next/link";
import { DeletePostForm } from "@/app/admin/posts/delete-post-form";
import { tiptapDocumentToPlainText } from "@/lib/posts/content";
import { getOwnerPostEventOptions } from "@/lib/posts/data";
import { requireJournalOwner } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";

export default async function PostsPage() {
  const owner = await requireJournalOwner();
  const supabase = await createClient();
  const [postsResult, eventsResult] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, title, slug, excerpt, content, event_id, status, visibility, published_at, updated_at",
      )
      .eq("user_id", owner.id)
      .order("updated_at", { ascending: false }),
    getOwnerPostEventOptions(owner.id),
  ]);
  const eventTitles = new Map(
    (eventsResult.data ?? []).map((event) => [
      event.id,
      { title: event.title, visibility: event.visibility },
    ]),
  );

  return (
    <main className="admin-content">
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">Your journal</p>
          <h1>Posts</h1>
          <p className="admin-lede">Write standalone stories or collect entries under an event.</p>
        </div>
        <Link className="button-primary" href="/admin/posts/new">
          New post
        </Link>
      </div>

      {postsResult.error ? (
        <p className="form-message" role="alert">
          Posts couldn’t be loaded. Please refresh the page and try again.
        </p>
      ) : postsResult.data?.length ? (
        <ul className="event-list" aria-label="Journal posts">
          {postsResult.data.map((post) => {
            const event = post.event_id ? eventTitles.get(post.event_id) : null;
            const fallbackText = tiptapDocumentToPlainText(post.content).trim();
            const eventLabel = post.event_id
              ? event
                ? `Event: ${event.title}${event.visibility === "private" ? " (private; hidden from public readers)" : ""}`
                : "Linked event details unavailable"
              : "Standalone post";
            const summary = post.excerpt?.trim() || fallbackText;

            return (
              <li key={post.id}>
                <article className="event-card">
                  <div className="event-card-main">
                    <div className="event-card-title-row">
                      <h2>
                        <Link href={`/admin/posts/${post.id}/edit`}>{post.title}</Link>
                      </h2>
                      <span className={`visibility-badge status-${post.status}`}>
                        {post.status}
                      </span>
                      <span className={`visibility-badge visibility-${post.visibility}`}>
                        {post.visibility}
                      </span>
                    </div>
                    <p className="event-slug">/{post.slug}</p>
                    <p className="event-dates">{eventLabel}</p>
                    {summary ? (
                      <p className="event-description">{summary.slice(0, 220)}</p>
                    ) : null}
                    {post.status === "published" && post.published_at ? (
                      <p className="event-dates">
                        Published {new Date(post.published_at).toLocaleDateString()}
                      </p>
                    ) : null}
                  </div>
                  <div className="event-card-actions">
                    <Link className="button-secondary" href={`/admin/posts/${post.id}/edit`}>
                      Edit
                    </Link>
                    <DeletePostForm
                      cancelHref="/admin/posts"
                      postId={post.id}
                      postTitle={post.title}
                    />
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="event-empty" aria-labelledby="empty-posts-title">
          <p className="eyebrow">A fresh page</p>
          <h2 id="empty-posts-title">No posts yet</h2>
          <p>Start with a standalone story or connect it to one of your events.</p>
          <Link className="button-primary" href="/admin/posts/new">
            Write a post
          </Link>
        </section>
      )}

      {eventsResult.error && !postsResult.error ? (
        <p className="form-message" role="status">
          Event names could not be loaded. Posts are still listed, but linked event details may be unavailable.
        </p>
      ) : null}
    </main>
  );
}

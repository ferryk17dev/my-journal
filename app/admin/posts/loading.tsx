export default function PostsLoading() {
  return (
    <main className="admin-content" aria-busy="true" aria-live="polite">
      <p className="eyebrow">Your journal</p>
      <h1>Posts</h1>
      <p className="admin-lede">Loading your posts…</p>
      <div className="event-loading-card" aria-hidden="true" />
      <div className="event-loading-card" aria-hidden="true" />
    </main>
  );
}

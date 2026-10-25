export default function EventsLoading() {
  return (
    <main className="admin-content" aria-busy="true" aria-live="polite">
      <p className="eyebrow">Your journal</p>
      <h1>Events</h1>
      <p className="admin-lede">Loading your events…</p>
      <div className="event-loading-card" aria-hidden="true" />
      <div className="event-loading-card" aria-hidden="true" />
    </main>
  );
}

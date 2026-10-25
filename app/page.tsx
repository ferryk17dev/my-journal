export default function HomePage() {
  return (
    <div className="shell">
      <header>
        <a className="brand" href="#top">
          Fieldnotes
        </a>
        <nav aria-label="Main navigation">
          <a href="#journal">Journal</a>
          <a href="#events">Events</a>
          <a href="#about">About</a>
        </nav>
      </header>

      <main id="top">
        <section className="intro" id="about">
          <div className="eyebrow">A personal journal</div>
          <h1>
            Small moments,
            <br />
            kept close.
          </h1>
          <p>
            A place for stories from the road, notes from ordinary days, and
            the things I want to remember.
          </p>
        </section>

        <section id="journal" aria-labelledby="journal-title">
          <div className="section-head">
            <h2 id="journal-title">Recent entries</h2>
            <a className="text-link" href="#journal">
              View all entries&nbsp; ↗
            </a>
          </div>
          <div className="posts">
            <article className="post">
              <div
                className="post-art art-coast"
                role="img"
                aria-label="Soft green hills meeting a quiet coast"
              />
              <div className="post-meta">Travel · May 18, 2025</div>
              <h3>
                <a href="#journal">A slower kind of weekend</a>
              </h3>
              <p>
                Two days by the water, long walks, and nowhere in particular to
                be.
              </p>
            </article>
            <article className="post" id="events">
              <div
                className="post-art art-window"
                role="img"
                aria-label="A sunlit window looking out onto a quiet landscape"
              />
              <div className="post-meta">At home · April 29, 2025</div>
              <h3>
                <a href="#journal">Light through the kitchen window</a>
              </h3>
              <p>A small note about morning coffee and the changing season.</p>
            </article>
            <article className="post">
              <div
                className="post-art art-market"
                role="img"
                aria-label="A row of colorful market stalls"
              />
              <div className="post-meta">City notes · March 12, 2025</div>
              <h3>
                <a href="#journal">Saturday at the market</a>
              </h3>
              <p>
                Flowers, fresh bread, and the familiar pleasure of taking the
                long way home.
              </p>
            </article>
          </div>
        </section>
      </main>

      <footer>
        <span>© 2025 Fieldnotes</span>
        <span>Made for remembering.</span>
      </footer>
    </div>
  );
}

import Link from "next/link";
import type { PublicThumbnail } from "@/lib/public/card-thumbnails";

type PublicSection = "home" | "events" | "journal";
type PublicPage = PublicSection | "event-detail";

export function PublicHeader({ activePage }: { activePage: PublicPage }) {
  const links: { label: string; href: string; section: PublicSection }[] = [
    { label: "Home", href: "/", section: "home" },
    { label: "Events", href: "/events", section: "events" },
    { label: "Journal", href: "/#journal", section: "journal" },
  ];

  return (
    <header className="site-header">
      <div className="shell site-header-inner">
        <Link className="brand" href="/" aria-label="My Journal home">My Journal<span aria-hidden="true">.</span></Link>
        <nav className="public-nav" aria-label="Main navigation">
          {links.map((link) => {
            const sectionActive =
              activePage === link.section ||
              (activePage === "event-detail" && link.section === "events") ||
              (activePage === "journal" && link.section === "journal");
            const exactPage = activePage === link.section;
            return (
              <Link
                key={link.section}
                href={link.href}
                aria-current={sectionActive ? (exactPage ? "page" : "location") : undefined}
                className={sectionActive ? "is-current" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="shell public-footer">
      <span>© {new Date().getFullYear()} My Journal</span>
      <Link href="/">Made for remembering.</Link>
    </footer>
  );
}

export function PublicPostCard({
  title,
  slug,
  excerpt,
  publishedAt,
  eventTitle,
  eventSlug,
  thumbnail,
}: {
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
  eventTitle?: string | null;
  eventSlug?: string | null;
  thumbnail?: PublicThumbnail;
}) {
  return (
    <article className="public-post-card">
      <CardMedia thumbnail={thumbnail} />
      <div className="public-card-body">
      <p className="post-meta">
        {eventTitle ? <><Link href={eventSlug ? `/events/${eventSlug}` : "/events"}>{eventTitle}</Link><span aria-hidden="true"> · </span></> : null}
        {publishedAt ? <time dateTime={publishedAt}>{formatPublicDate(publishedAt)}</time> : null}
      </p>
      <h2><Link href={`/posts/${slug}`}>{title}</Link></h2>
      {excerpt ? <p>{excerpt}</p> : null}
      <Link className="public-card-link" href={`/posts/${slug}`} aria-label={`Read ${title}`}>
        Read entry <span aria-hidden="true">→</span>
      </Link>
      </div>
    </article>
  );
}

export function PublicEventCard({
  title,
  slug,
  description,
  startDate,
  endDate,
  thumbnail,
}: {
  title: string;
  slug: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  thumbnail?: PublicThumbnail;
}) {
  return (
    <article className="public-event-card">
      <CardMedia thumbnail={thumbnail} />
      <div className="public-card-body">
      <p className="eyebrow">{formatDateRange(startDate, endDate)}</p>
      <h2><Link href={`/events/${slug}`}>{title}</Link></h2>
      {description ? <p>{description}</p> : null}
      <Link className="public-card-link" href={`/events/${slug}`}>
        Explore event <span aria-hidden="true">→</span>
      </Link>
      </div>
    </article>
  );
}

function CardMedia({ thumbnail }: { thumbnail?: PublicThumbnail }) {
  return (
    <div className="public-card-media">
      {thumbnail ? (
        <img src={thumbnail.src} alt={thumbnail.alt} loading="lazy" />
      ) : (
        <div className="public-card-placeholder" aria-hidden="true">
          <span>My Journal</span>
        </div>
      )}
    </div>
  );
}

export function formatPublicDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatPublicDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jakarta",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  const day = part("day");
  const month = part("month");
  const year = part("year");
  const hour = part("hour");
  const minute = part("minute");
  if (!day || !month || !year || !hour || !minute) return null;
  return `${day} ${month} ${year} · ${hour}:${minute} WIB`;
}

export function formatDateRange(startDate: string | null, endDate: string | null) {
  if (startDate && endDate && startDate !== endDate) {
    return `${formatPublicDate(startDate)} – ${formatPublicDate(endDate)}`;
  }
  if (startDate || endDate) return formatPublicDate(startDate ?? endDate!);
  return "A journal event";
}

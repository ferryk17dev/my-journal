import type { JSONContent } from "@tiptap/core";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  PublicFooter,
  PublicHeader,
  formatPublicDate,
} from "@/app/components/public-navigation";
import { isAllowedPostLink } from "@/lib/posts/links";
import { createPublicClient } from "@/lib/supabase/public-server";

type PublicImage = { id: string; storage_path: string; alt_text: string | null; caption: string | null };
type RenderBudget = { remaining: number };

function renderMarks(text: string, marks: JSONContent["marks"], key: string): ReactNode {
  let output: ReactNode = text;
  const safeMarks = Array.isArray(marks) ? marks.slice(0, 20) : [];
  for (const [index, mark] of safeMarks.entries()) {
    if (!mark || typeof mark !== "object") continue;
    if (mark.type === "bold") output = <strong key={`${key}-b${index}`}>{output}</strong>;
    else if (mark.type === "italic") output = <em key={`${key}-i${index}`}>{output}</em>;
    else if (mark.type === "underline") output = <u key={`${key}-u${index}`}>{output}</u>;
    else if (mark.type === "strike") output = <s key={`${key}-s${index}`}>{output}</s>;
    else if (mark.type === "link" && typeof mark.attrs?.href === "string" && isAllowedPostLink(mark.attrs.href)) {
      output = (
        <a href={mark.attrs.href} rel="noopener noreferrer nofollow" key={`${key}-a${index}`}>
          {output}
        </a>
      );
    }
  }
  return output;
}

function renderNode(
  node: JSONContent,
  images: Map<string, PublicImage>,
  key: string,
  budget: RenderBudget,
  depth = 0,
): ReactNode {
  budget.remaining -= 1;
  if (budget.remaining < 0 || depth > 20 || !node || typeof node !== "object") return null;
  const children = Array.isArray(node.content)
    ? node.content.map((child, index) => renderNode(child, images, `${key}-${index}`, budget, depth + 1))
    : null;

  switch (node.type) {
    case "text":
      return typeof node.text === "string" ? renderMarks(node.text, node.marks, key) : null;
    case "paragraph": return <p key={key}>{children}</p>;
    case "heading":
      if (node.attrs?.level === 2) return <h2 key={key}>{children}</h2>;
      if (node.attrs?.level === 3) return <h3 key={key}>{children}</h3>;
      return null;
    case "blockquote": return <blockquote key={key}>{children}</blockquote>;
    case "bulletList": return <ul key={key}>{children}</ul>;
    case "orderedList": {
      const rawStart = Number(node.attrs?.start ?? 1);
      const start = Number.isInteger(rawStart) && rawStart >= 1 && rawStart <= 10_000 ? rawStart : 1;
      const rawType = node.attrs?.type;
      const type = ["1", "a", "A", "i", "I"].includes(rawType) ? rawType as "1" | "a" | "A" | "i" | "I" : undefined;
      return <ol key={key} start={start} type={type}>{children}</ol>;
    }
    case "listItem": return <li key={key}>{children}</li>;
    case "horizontalRule": return <hr key={key} />;
    case "journalImage": {
      const path = typeof node.attrs?.storagePath === "string" ? node.attrs.storagePath : "";
      const image = images.get(path);
      if (!image) return null;
      return (
        <figure key={key}>
          <img src={`/api/images/${image.id}`} alt={image.alt_text ?? ""} loading="lazy" />
          {image.caption ? <figcaption>{image.caption}</figcaption> : null}
        </figure>
      );
    }
    default:
      return null;
  }
}

export default async function PublicPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await connection();
  const supabase = createPublicClient();
  const { data: post, error } = await supabase
    .from("posts")
    .select("id, title, excerpt, content, status, visibility, event_id, published_at")
    .eq("slug", slug)
    .maybeSingle();

  // This client always uses the anonymous role, so the posts RLS policy also
  // enforces the public-profile requirement even for a signed-in owner.
  if (error || !post || post.status !== "published" || post.visibility !== "public") notFound();

  let event: { title: string; slug: string; visibility: string } | null = null;
  if (post.event_id) {
    const { data, error: eventError } = await supabase
      .from("events")
      .select("title, slug, visibility")
      .eq("id", post.event_id)
      .maybeSingle();
    if (eventError || !data || data.visibility !== "public") notFound();
    event = data;
  }

  const { data: imageRows } = await supabase
    .from("post_images")
    .select("id, storage_path, alt_text, caption")
    .eq("post_id", post.id);
  const images = new Map((imageRows ?? []).map((image) => [image.storage_path, image as PublicImage]));
  const document = post.content as JSONContent;
  const budget = { remaining: 10_000 };
  const content = Array.isArray(document.content)
    ? document.content.map((node, index) => renderNode(node, images, `post-${index}`, budget))
    : null;

  return (
    <div className="public-shell">
      <PublicHeader activePage="journal" />
      <main className="shell public-post">
        <article className="public-article">
          <header className="public-article-header">
            <p className="public-article-kicker">
              {event ? <Link href={`/events/${event.slug}`}>{event.title}</Link> : "Personal journal"}
            </p>
            <h1>{post.title}</h1>
            {post.published_at ? (
              <p className="public-post-date">
                <time dateTime={post.published_at}>{formatPublicDate(post.published_at)}</time>
              </p>
            ) : null}
            {post.excerpt ? <p className="public-post-excerpt">{post.excerpt}</p> : null}
          </header>
          <div className="public-post-content">{content}</div>
        </article>
        <nav className="public-post-navigation" aria-label="Journal navigation">
          <Link className="text-link" href="/">← Home</Link>
          <Link className="text-link" href="/events">Browse events →</Link>
        </nav>
      </main>
      <PublicFooter />
    </div>
  );
}

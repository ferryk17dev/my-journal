import type { JSONContent } from "@tiptap/core";
import type { ReactNode } from "react";
import { isAllowedPostLink } from "@/lib/posts/links";

type Budget = { remaining: number };

function renderText(text: string, marks: JSONContent["marks"], key: string): ReactNode {
  let output: ReactNode = text;
  const allowedMarks = Array.isArray(marks) ? marks.slice(0, 20) : [];

  for (const [index, mark] of allowedMarks.entries()) {
    if (!mark || typeof mark !== "object") continue;
    if (mark.type === "bold") output = <strong key={`${key}-bold-${index}`}>{output}</strong>;
    else if (mark.type === "italic") output = <em key={`${key}-italic-${index}`}>{output}</em>;
    else if (mark.type === "underline") output = <u key={`${key}-underline-${index}`}>{output}</u>;
    else if (mark.type === "strike") output = <s key={`${key}-strike-${index}`}>{output}</s>;
    else if (
      mark.type === "link" &&
      typeof mark.attrs?.href === "string" &&
      isAllowedPostLink(mark.attrs.href)
    ) {
      output = (
        <a href={mark.attrs.href} rel="noopener noreferrer nofollow" key={`${key}-link-${index}`}>
          {output}
        </a>
      );
    }
  }

  return output;
}

function renderNode(node: JSONContent, key: string, budget: Budget, depth = 0): ReactNode {
  budget.remaining -= 1;
  if (budget.remaining < 0 || depth > 20 || !node || typeof node !== "object") return null;

  const children = Array.isArray(node.content)
    ? node.content
        .slice(0, Math.max(0, budget.remaining))
        .map((child, index) => renderNode(child, `${key}-${index}`, budget, depth + 1))
    : null;

  switch (node.type) {
    case "text":
      return typeof node.text === "string" ? renderText(node.text, node.marks, key) : null;
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
      return <ol key={key} start={start}>{children}</ol>;
    }
    case "listItem": return <li key={key}>{children}</li>;
    case "horizontalRule": return <hr key={key} />;
    default: return null;
  }
}

export function renderPublicEventSummary(value: unknown): ReactNode | null {
  if (!value || typeof value !== "object") return null;
  const document = value as JSONContent;
  if (document.type !== "doc" || !Array.isArray(document.content)) return null;

  function hasVisibleContent(node: JSONContent, depth = 0): boolean {
    if (!node || typeof node !== "object" || depth > 20) return false;
    if (node.type === "text") return typeof node.text === "string" && node.text.trim().length > 0;
    if (node.type === "horizontalRule") return true;
    return Array.isArray(node.content) && node.content.some((child) => hasVisibleContent(child, depth + 1));
  }
  if (!document.content.some((node) => hasVisibleContent(node))) return null;

  const budget = { remaining: 4_000 };
  const content = document.content.slice(0, 4_000).map((node, index) =>
    renderNode(node, `event-summary-${index}`, budget),
  );
  return content.some((node) => node !== null) ? content : null;
}

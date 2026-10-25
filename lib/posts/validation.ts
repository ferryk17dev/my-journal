import { z } from "zod";
import type { JSONContent } from "@tiptap/core";
import { isAllowedPostLink } from "@/lib/posts/links";

const markSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }).strict(),
  z.object({ type: z.literal("italic") }).strict(),
  z.object({ type: z.literal("underline") }).strict(),
  z.object({ type: z.literal("strike") }).strict(),
  z
    .object({
      type: z.literal("link"),
      attrs: z
        .object({
          href: z.string().refine(isAllowedPostLink, "Use an http, https, or mailto link."),
          target: z.literal("_blank").nullable().optional(),
          rel: z.literal("noopener noreferrer nofollow").nullable().optional(),
          class: z.null().optional(),
          title: z.string().max(256).nullable().optional(),
        })
        .strict(),
    })
    .strict(),
]);

const textNodeSchema = z
  .object({
    type: z.literal("text"),
    text: z.string().min(1).max(100_000),
    marks: z.array(markSchema).max(5).optional(),
  })
  .strict();

const paragraphSchema = z
  .object({
    type: z.literal("paragraph"),
    content: z.array(textNodeSchema).optional(),
  })
  .strict();

const headingSchema = z
  .object({
    type: z.literal("heading"),
    attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }).strict(),
    content: z.array(textNodeSchema).optional(),
  })
  .strict();

const journalImageSchema = z
  .object({
    type: z.literal("journalImage"),
    attrs: z
      .object({
        storagePath: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/posts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i),
        alt: z.string().max(500),
      })
      .strict(),
  })
  .strict();

let blockNodeSchema: z.ZodTypeAny;

const listItemSchema: z.ZodTypeAny = z
  .lazy(() =>
    z
      .object({
        type: z.literal("listItem"),
        content: z.array(blockNodeSchema).min(1),
      })
      .strict(),
  )
  .superRefine((listItem, context) => {
    const firstBlock = Array.isArray(listItem.content)
      ? listItem.content[0]
      : null;
    if (
      !firstBlock ||
      typeof firstBlock !== "object" ||
      !("type" in firstBlock) ||
      firstBlock.type !== "paragraph"
    ) {
      context.addIssue({
        code: "custom",
        path: ["content", 0],
        message: "List items must begin with a paragraph.",
      });
    }
  });

const orderedListAttributesSchema = z
  .object({
    start: z.number().int().min(1).max(10_000),
    type: z.enum(["1", "a", "A", "i", "I"]).nullable(),
  })
  .strict();

blockNodeSchema = z.lazy(() =>
  z.discriminatedUnion("type", [
    paragraphSchema,
    headingSchema,
    journalImageSchema,
    z
      .object({
        type: z.literal("blockquote"),
        content: z.array(blockNodeSchema).min(1),
      })
      .strict(),
    z
      .object({
        type: z.literal("bulletList"),
        content: z.array(listItemSchema).min(1),
      })
      .strict(),
    z
      .object({
        type: z.literal("orderedList"),
        attrs: orderedListAttributesSchema,
        content: z.array(listItemSchema).min(1),
      })
      .strict(),
    z.object({ type: z.literal("horizontalRule") }).strict(),
  ]),
);

export const tiptapDocumentSchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(blockNodeSchema).min(1),
  })
  .strict();

function isWithinEditorBounds(value: unknown) {
  const pending: Array<{ value: unknown; depth: number }> = [
    { value, depth: 0 },
  ];
  let visited = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    visited += 1;
    if (visited > 10_000 || current.depth > 20) return false;

    if (Array.isArray(current.value)) {
      for (const child of current.value) {
        pending.push({ value: child, depth: current.depth + 1 });
      }
    } else if (current.value && typeof current.value === "object") {
      for (const child of Object.values(current.value)) {
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
  }

  return true;
}

const editorContentSchema = z.string().max(300_000).transform((raw, context) => {
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch {
    context.addIssue({
      code: "custom",
      message: "Editor content is invalid. Review the post and try again.",
    });
    return z.NEVER;
  }

  if (!isWithinEditorBounds(document)) {
    context.addIssue({
      code: "custom",
      message: "Editor content is too deeply nested or contains too many items.",
    });
    return z.NEVER;
  }

  const result = tiptapDocumentSchema.safeParse(document);
  if (!result.success) {
    context.addIssue({
      code: "custom",
      message: "Editor content contains unsupported formatting or attributes.",
    });
    return z.NEVER;
  }

  return result.data as JSONContent;
});

const optionalExcerpt = z
  .string()
  .transform((value) => (value.trim() === "" ? null : value))
  .refine((value) => value === null || value.length <= 500, {
    message: "Summary must be 500 characters or fewer.",
  });

export const postFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Enter a post title.")
      .max(200, "Title must be 200 characters or fewer."),
    slug: z
      .string()
      .trim()
      .min(1, "Enter a URL slug.")
      .max(160, "Slug must be 160 characters or fewer.")
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Use lowercase letters and numbers separated by single hyphens.",
      ),
    excerpt: optionalExcerpt,
    content: editorContentSchema,
    event_id: z
      .union([z.literal(""), z.string().uuid()])
      .transform((value) => (value === "" ? null : value)),
    status: z.enum(["draft", "published"], {
      error: "Choose a post status.",
    }),
    visibility: z.enum(["private", "public"], {
      error: "Choose a visibility.",
    }),
  })
  .superRefine((post, context) => {
    if (post.status === "published" && !hasEditorText(post.content)) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: "Add some content before publishing this post.",
      });
    }
  });

function hasEditorText(document: unknown): boolean {
  if (!document || typeof document !== "object" || !("content" in document)) {
    return false;
  }

  const pending = [document.content];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      pending.push(...current);
    } else if (current && typeof current === "object") {
      if ("text" in current && typeof current.text === "string" && current.text.trim()) {
        return true;
      }
      if ("content" in current) pending.push(current.content);
    }
  }

  return false;
}

export type PostFormValues = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  event_id: string;
  status: string;
  visibility: string;
};

export type PostFormState = {
  message?: string;
  fieldErrors?: Partial<Record<keyof PostFormValues, string[]>>;
  values?: PostFormValues;
};

export const postIdSchema = z.string().uuid();

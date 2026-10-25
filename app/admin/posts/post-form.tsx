"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { TiptapEditor } from "@/app/admin/posts/tiptap-editor";
import type { PostEventOption } from "@/lib/posts/data";
import type { PostFormState, PostFormValues } from "@/lib/posts/validation";

type PostAction = (
  state: PostFormState,
  formData: FormData,
) => Promise<PostFormState>;

const emptyValues: PostFormValues = {
  title: "",
  slug: "",
  excerpt: "",
  content: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }),
  event_id: "",
  status: "draft",
  visibility: "private",
};

export function PostForm({
  action,
  initialValues = emptyValues,
  events,
  submitLabel,
  eventLoadError = false,
  postId = null,
}: {
  action: PostAction;
  initialValues?: PostFormValues;
  events: PostEventOption[];
  submitLabel: string;
  eventLoadError?: boolean;
  postId?: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [editorDirty, setEditorDirty] = useState(false);
  const values = { ...initialValues, ...state.values };

  useEffect(() => {
    if (!editorDirty || pending) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    const confirmInternalNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      ) {
        return;
      }

      const destination = new URL(link.href, window.location.href);
      if (destination.href === window.location.href) return;

      if (!window.confirm("You have unsaved editor changes. Leave this page and discard them?")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", confirmInternalNavigation, true);

    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", confirmInternalNavigation, true);
    };
  }, [editorDirty, pending]);

  function fieldProps(name: keyof PostFormValues) {
    const hasError = Boolean(state.fieldErrors?.[name]?.length);
    return {
      "aria-invalid": hasError,
      "aria-describedby": hasError ? `${name}-error` : undefined,
    };
  }

  function fieldError(name: keyof PostFormValues) {
    const error = state.fieldErrors?.[name]?.[0];
    return error ? (
      <p className="field-error" id={`${name}-error`}>
        {error}
      </p>
    ) : null;
  }

  return (
    <form action={formAction} className="event-form">
      {state.message ? (
        <p className="form-message" role="alert">
          {state.message}
        </p>
      ) : null}
      {eventLoadError ? (
        <p className="form-message" role="alert">
          Events couldn’t be loaded. You can still save a standalone post; refresh to select an event.
        </p>
      ) : null}

      <div className="event-form-grid">
        <div className="event-field event-field-wide">
          <label htmlFor="title">Title</label>
          <input
            {...fieldProps("title")}
            autoComplete="off"
            id="title"
            maxLength={200}
            name="title"
            required
            defaultValue={values.title}
          />
          {fieldError("title")}
        </div>

        <div className="event-field event-field-wide">
          <label htmlFor="slug">URL slug</label>
          <input
            {...fieldProps("slug")}
            autoCapitalize="none"
            autoComplete="off"
            id="slug"
            maxLength={160}
            name="slug"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="a-slower-kind-of-weekend"
            required
            defaultValue={values.slug}
          />
          <span className="field-help">Lowercase letters and numbers separated by hyphens.</span>
          {fieldError("slug")}
        </div>

        <div className="event-field event-field-wide">
          <label htmlFor="excerpt">Summary</label>
          <textarea
            {...fieldProps("excerpt")}
            id="excerpt"
            maxLength={500}
            name="excerpt"
            rows={3}
            defaultValue={values.excerpt}
          />
          <span className="field-help">Optional. Up to 500 characters.</span>
          {fieldError("excerpt")}
        </div>

        <div className="event-field event-field-wide">
          <span className="event-field-label" id="content-label">
            Content
          </span>
          <TiptapEditor
            descriptionId={
              fieldProps("content")["aria-describedby"]
                ? "content-help content-error"
                : "content-help"
            }
            initialContentJson={initialValues.content || emptyValues.content}
            postId={postId}
            labelId="content-label"
            invalid={Boolean(state.fieldErrors?.content?.length)}
            onDirtyChange={setEditorDirty}
          />
          <span className="field-help" id="content-help">
            Format your post with headings, lists, quotes, links, and images. JPEG, PNG, and WebP files up to 5 MB are supported.
          </span>
          {fieldError("content")}
        </div>

        <div className="event-field event-field-wide">
          <label htmlFor="event_id">Event</label>
          <select
            {...fieldProps("event_id")}
            id="event_id"
            name="event_id"
            defaultValue={values.event_id}
          >
            <option value="">Standalone post</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title} ({event.visibility})
              </option>
            ))}
          </select>
          <span className="field-help">
            Posts on private events remain hidden from public readers, even if the post is public and published.
          </span>
          {events.length === 0 && !eventLoadError ? (
            <span className="field-help">
              No events yet. You can create one from <Link href="/admin/events">Events</Link>.
            </span>
          ) : null}
          {fieldError("event_id")}
        </div>

        <div className="event-field">
          <label htmlFor="status">Status</label>
          <select
            {...fieldProps("status")}
            id="status"
            name="status"
            defaultValue={values.status}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          {fieldError("status")}
        </div>

        <div className="event-field">
          <label htmlFor="visibility">Visibility</label>
          <select
            {...fieldProps("visibility")}
            id="visibility"
            name="visibility"
            defaultValue={values.visibility}
          >
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
          {fieldError("visibility")}
        </div>
      </div>

      <div className="event-form-actions">
        <button className="button-primary" disabled={pending} type="submit">
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link className="button-secondary" href="/admin/posts">
          Cancel
        </Link>
      </div>
      <p className="sr-only" aria-live="polite">
        {pending ? "Saving post." : ""}
      </p>
    </form>
  );
}

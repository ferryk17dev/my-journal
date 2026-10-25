"use client";

import Link from "next/link";
import { useActionState } from "react";
import { deletePost } from "@/app/admin/posts/actions";
import type { PostFormState } from "@/lib/posts/validation";

export function DeletePostForm({
  postId,
  postTitle,
  cancelHref,
}: {
  postId: string;
  postTitle: string;
  cancelHref: string;
}) {
  const deleteAction = deletePost.bind(null, postId);
  const [state, formAction, pending] = useActionState<PostFormState, FormData>(
    deleteAction,
    {},
  );
  const warningId = `delete-post-warning-${postId}`;

  return (
    <details className="event-delete">
      <summary>Delete</summary>
      <div className="event-delete-panel" role="group" aria-labelledby={warningId}>
        <p id={warningId}>
          Delete “{postTitle}”? This also removes its image metadata. Stored image files, if any, need separate Storage cleanup.
        </p>
        {state.message ? (
          <p className="form-message" role="alert">
            {state.message}
          </p>
        ) : null}
        <form action={formAction}>
          <button className="button-danger" disabled={pending} type="submit">
            {pending ? "Deleting…" : "Confirm delete"}
          </button>
          <Link className="button-secondary" href={cancelHref}>
            Cancel
          </Link>
        </form>
        <p className="sr-only" aria-live="polite">
          {pending ? "Deleting post." : ""}
        </p>
      </div>
    </details>
  );
}

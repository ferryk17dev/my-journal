"use client";

import { useActionState } from "react";
import Link from "next/link";
import { deleteEvent } from "@/app/admin/events/actions";
import type { EventFormState } from "@/lib/events/validation";

export function DeleteEventForm({
  eventId,
  eventTitle,
  cancelHref,
}: {
  eventId: string;
  eventTitle: string;
  cancelHref: string;
}) {
  const deleteAction = deleteEvent.bind(null, eventId);
  const [state, formAction, pending] = useActionState<EventFormState, FormData>(
    deleteAction,
    {},
  );
  const warningId = `delete-warning-${eventId}`;

  return (
    <details className="event-delete">
      <summary>Delete</summary>
      <div className="event-delete-panel" role="group" aria-labelledby={warningId}>
        <p id={warningId}>
          Delete “{eventTitle}”? Posts associated with this event will remain in your journal as standalone posts.
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
          {pending ? "Deleting event." : ""}
        </p>
      </div>
    </details>
  );
}

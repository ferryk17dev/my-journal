"use client";

import { useActionState, useState } from "react";
import {
  createEventItem,
  deleteEventItem,
  updateEventItem,
} from "@/app/admin/events/item-actions";
import type { EventItemActionState } from "@/lib/event-items/validation";

type EventItem = {
  id: string;
  title: string | null;
  caption: string;
  occurred_at: string | null;
  sort_order: number;
  updated_at: string;
};

type ItemAction = (
  state: EventItemActionState,
  formData: FormData,
) => Promise<EventItemActionState>;

function FieldError({
  id,
  errors,
}: {
  id: string;
  errors?: string[];
}) {
  return errors?.[0] ? (
    <p className="field-error" id={id}>
      {errors[0]}
    </p>
  ) : null;
}

function ItemFieldsForm({
  action,
  item,
  nextOrder,
}: {
  action: ItemAction;
  item?: EventItem;
  nextOrder: number;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const prefix = item ? `event-item-${item.id}` : "new-event-item";
  const occurredValue = item?.occurred_at?.slice(0, 16) ?? "";
  const values = state.values;

  function fieldProps(name: "title" | "caption" | "occurred_at" | "sort_order") {
    const errors = state.fieldErrors?.[name];
    const errorId = `${prefix}-${name}-error`;
    return {
      id: `${prefix}-${name}`,
      name,
      "aria-invalid": Boolean(errors?.length),
      "aria-describedby": errors?.length ? errorId : undefined,
    };
  }

  return (
    <form action={formAction} className="event-item-form">
      {state.message ? (
        <p className={state.status === "success" ? "event-item-success" : "form-message"} role={state.status === "success" ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}

      <div className="event-item-form-grid">
        <div className="event-field">
          <label htmlFor={`${prefix}-title`}>Title <span className="field-help-inline">(optional)</span></label>
          <input
            {...fieldProps("title")}
            defaultValue={values?.title ?? item?.title ?? ""}
            maxLength={200}
            autoComplete="off"
          />
          <FieldError id={`${prefix}-title-error`} errors={state.fieldErrors?.title} />
        </div>

        <div className="event-field">
          <label htmlFor={`${prefix}-sort_order`}>Sort order</label>
          <input
            {...fieldProps("sort_order")}
            type="number"
            min={0}
            max={2_147_483_647}
            step={1}
            required
            defaultValue={values?.sort_order ?? String(item?.sort_order ?? nextOrder)}
          />
          <span className="field-help">Lower numbers appear first. Equal values are ordered by item ID.</span>
          <FieldError id={`${prefix}-sort_order-error`} errors={state.fieldErrors?.sort_order} />
        </div>

        <div className="event-field">
          <label htmlFor={`${prefix}-occurred_at`}>Occurrence date and time <span className="field-help-inline">(UTC, optional)</span></label>
          <input
            {...fieldProps("occurred_at")}
            type="datetime-local"
            defaultValue={values?.occurred_at ?? occurredValue}
          />
          <FieldError id={`${prefix}-occurred_at-error`} errors={state.fieldErrors?.occurred_at} />
        </div>

        <div className="event-field event-field-wide">
          <label htmlFor={`${prefix}-caption`}>Caption</label>
          <textarea
            {...fieldProps("caption")}
            maxLength={500}
            minLength={1}
            required
            rows={3}
            defaultValue={values?.caption ?? item?.caption ?? ""}
          />
          <span className="field-help">Required, up to 500 characters.</span>
          <FieldError id={`${prefix}-caption-error`} errors={state.fieldErrors?.caption} />
        </div>

        <div className="event-field event-field-wide">
          <label htmlFor={`${prefix}-image`}>{item ? "Replace image" : "Image"}{item ? " (optional)" : ""}</label>
          <input
            id={`${prefix}-image`}
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required={!item}
            aria-invalid={Boolean(state.fieldErrors?.image?.length)}
            aria-describedby={state.fieldErrors?.image?.length ? `${prefix}-image-error` : `${prefix}-image-help`}
          />
          <span className="field-help" id={`${prefix}-image-help`}>JPEG, PNG, or WebP. Maximum 5 MB. Original filenames are not stored.</span>
          <FieldError id={`${prefix}-image-error`} errors={state.fieldErrors?.image} />
        </div>
      </div>

      <div className="event-form-actions">
        <button className="button-primary" disabled={pending} type="submit">
          {pending ? (item ? "Saving…" : "Uploading…") : item ? "Save item" : "+ Add Event Item"}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {pending ? (item ? "Saving Event Item." : "Uploading Event Item image.") : ""}
      </p>
    </form>
  );
}

function DeleteEventItemControl({
  eventId,
  item,
}: {
  eventId: string;
  item: EventItem;
}) {
  const action = deleteEventItem.bind(null, eventId, item.id);
  const [state, formAction, pending] = useActionState(action, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="event-item-delete">
      {!confirming ? (
        <button className="button-danger button-danger-outline" type="button" onClick={() => setConfirming(true)}>
          Delete item
        </button>
      ) : (
        <div className="event-item-delete-confirm" role="group" aria-labelledby={`delete-item-${item.id}`}>
          <p id={`delete-item-${item.id}`}>Delete this Event Item and its image?</p>
        {state.message ? (
          <p className={state.status === "success" ? "event-item-success" : "form-message"} role={state.status === "success" ? "status" : "alert"}>
            {state.message}
          </p>
        ) : null}
        <form action={formAction}>
          <button className="button-danger" disabled={pending} type="submit">
            {pending ? "Deleting…" : "Confirm delete"}
          </button>
          <button className="button-secondary" disabled={pending} type="button" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </form>
        <p className="sr-only" aria-live="polite">{pending ? "Deleting Event Item." : ""}</p>
        </div>
      )}
    </div>
  );
}

function EventItemCard({
  eventId,
  item,
  nextOrder,
}: {
  eventId: string;
  item: EventItem;
  nextOrder: number;
}) {
  const action = updateEventItem.bind(null, eventId, item.id);

  return (
    <li>
      <article className="event-item-card">
        <img
          className="event-item-preview"
          src={`/api/event-item-images/${item.id}?v=${encodeURIComponent(item.updated_at)}`}
          alt={item.title || item.caption}
          loading="lazy"
        />
        <div className="event-item-card-content">
          <h3>{item.title || "Untitled item"}</h3>
          <ItemFieldsForm action={action} item={item} nextOrder={nextOrder} />
          <DeleteEventItemControl eventId={eventId} item={item} />
        </div>
      </article>
    </li>
  );
}

export function EventItemsManager({
  eventId,
  items,
  loadError = false,
}: {
  eventId: string;
  items: EventItem[];
  loadError?: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const usedOrders = new Set(items.map((item) => item.sort_order));
  let nextOrder = 0;
  while (usedOrders.has(nextOrder) && nextOrder < 2_147_483_647) nextOrder += 1;
  const createAction = createEventItem.bind(null, eventId);

  return (
    <section className="event-items-section" aria-labelledby="event-items-heading">
      <div className="event-items-heading">
        <div>
          <p className="eyebrow">Event gallery</p>
          <h2 id="event-items-heading">Event Items</h2>
          <p className="admin-lede">Each item pairs one image with its caption and optional date.</p>
        </div>
        <button
          className="button-secondary"
          type="button"
          disabled={loadError}
          aria-expanded={isAdding}
          aria-controls="add-event-item-panel"
          onClick={() => setIsAdding((open) => !open)}
        >
          {isAdding ? "Close form" : "+ Add Event Item"}
        </button>
      </div>

      {loadError ? (
        <p className="form-message" role="alert">Event Items could not be loaded. Refresh the page before making changes.</p>
      ) : null}

      {!loadError && isAdding ? (
        <div className="add-event-item-panel" id="add-event-item-panel">
          <h3>New Event Item</h3>
          <ItemFieldsForm action={createAction} nextOrder={nextOrder} />
        </div>
      ) : null}

      {!loadError && items.length ? (
        <ol className="event-items-list" aria-label="Event Items ordered by sort order">
          {items.map((item) => (
            <EventItemCard
              key={item.id}
              eventId={eventId}
              item={item}
              nextOrder={nextOrder}
            />
          ))}
        </ol>
      ) : !loadError ? (
        <div className="event-items-empty">
          <div className="event-item-placeholder" aria-hidden="true">Image preview</div>
          <div>
            <h3>No Event Items yet</h3>
            <p>Add an image, caption it, and choose where it appears in the event.</p>
            {!isAdding ? (
              <button className="text-link-button" type="button" onClick={() => setIsAdding(true)}>
                + Add Event Item
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

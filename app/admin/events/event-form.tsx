"use client";

import { useActionState } from "react";
import type { EventFormState, EventFormValues } from "@/lib/events/validation";

type EventAction = (
  state: EventFormState,
  formData: FormData,
) => Promise<EventFormState>;

const emptyValues: EventFormValues = {
  title: "",
  slug: "",
  description: "",
  start_date: "",
  end_date: "",
  cover_image_path: "",
  visibility: "private",
};

export function EventForm({
  action,
  initialValues = emptyValues,
  submitLabel,
}: {
  action: EventAction;
  initialValues?: EventFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = { ...initialValues, ...state.values };

  function fieldError(name: keyof EventFormValues) {
    const errors = state.fieldErrors?.[name];
    if (!errors?.length) return null;

    return (
      <p className="field-error" id={`${name}-error`}>
        {errors[0]}
      </p>
    );
  }

  function fieldProps(name: keyof EventFormValues) {
    const hasError = Boolean(state.fieldErrors?.[name]?.length);
    return {
      "aria-invalid": hasError,
      "aria-describedby": hasError ? `${name}-error` : undefined,
    };
  }

  return (
    <form action={formAction} className="event-form">
      {state.message ? (
        <p className="form-message" role="alert">
          {state.message}
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
            placeholder="weekend-by-the-sea"
            required
            defaultValue={values.slug}
          />
          <span className="field-help">Lowercase letters and numbers separated by hyphens.</span>
          {fieldError("slug")}
        </div>

        <div className="event-field event-field-wide">
          <label htmlFor="description">Description</label>
          <textarea
            {...fieldProps("description")}
            id="description"
            maxLength={10_000}
            name="description"
            rows={5}
            defaultValue={values.description}
          />
          {fieldError("description")}
        </div>

        <div className="event-field">
          <label htmlFor="start_date">Start date</label>
          <input
            {...fieldProps("start_date")}
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={values.start_date}
          />
          {fieldError("start_date")}
        </div>

        <div className="event-field">
          <label htmlFor="end_date">End date</label>
          <input
            {...fieldProps("end_date")}
            id="end_date"
            name="end_date"
            type="date"
            defaultValue={values.end_date}
          />
          {fieldError("end_date")}
        </div>

        <div className="event-field event-field-wide">
          <label htmlFor="cover_image_path">Cover image path</label>
          <input
            {...fieldProps("cover_image_path")}
            autoComplete="off"
            id="cover_image_path"
            name="cover_image_path"
            type="text"
            defaultValue={values.cover_image_path}
          />
          <span className="field-help">Optional Storage path; image uploading is not included here.</span>
          {fieldError("cover_image_path")}
        </div>

        <fieldset
          {...fieldProps("visibility")}
          className="event-visibility event-field-wide"
        >
          <legend>Visibility</legend>
          <label className="radio-option">
            <input
              name="visibility"
              type="radio"
              value="private"
              defaultChecked={values.visibility === "private"}
            />
            <span>Private</span>
          </label>
          <label className="radio-option">
            <input
              name="visibility"
              type="radio"
              value="public"
              defaultChecked={values.visibility === "public"}
            />
            <span>Public</span>
          </label>
          {fieldError("visibility")}
        </fieldset>
      </div>

      <div className="event-form-actions">
        <button className="button-primary" disabled={pending} type="submit">
          {pending ? "Saving…" : submitLabel}
        </button>
        <a className="button-secondary" href="/admin/events">
          Cancel
        </a>
      </div>
      <p className="sr-only" aria-live="polite">
        {pending ? "Saving event." : ""}
      </p>
    </form>
  );
}

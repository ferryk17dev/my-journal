import { z } from "zod";

const optionalTitle = z
  .string()
  .trim()
  .transform((value) => value || null)
  .refine((value) => value === null || value.length <= 200, {
    message: "Title must be 200 characters or fewer.",
  });

function isLocalDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  date.setUTCFullYear(year);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute
  );
}

const optionalOccurrence = z
  .string()
  .trim()
  .refine((value) => value === "" || isLocalDateTime(value), {
    message: "Enter a valid occurrence date and time.",
  })
  .transform((value) => value || null);

export const eventItemFormSchema = z.object({
  title: optionalTitle,
  caption: z
    .string()
    .trim()
    .min(1, "Enter a caption.")
    .max(500, "Caption must be 500 characters or fewer."),
  occurred_at: optionalOccurrence,
  sort_order: z
    .string()
    .regex(/^\d+$/, "Sort order must be a non-negative whole number.")
    .transform(Number)
    .pipe(z.number().int().min(0).max(2_147_483_647, "Sort order is too large.")),
});

export type EventItemFormValues = z.input<typeof eventItemFormSchema>;
export type EventItemFieldErrors = Partial<
  Record<keyof EventItemFormValues | "image", string[]>
>;

export type EventItemActionState = {
  status?: "success" | "error";
  message?: string;
  fieldErrors?: EventItemFieldErrors;
  values?: EventItemFormValues;
};

export function eventItemOccurrenceToIso(
  value: string | null,
) {
  if (!value) return null;
  return new Date(`${value}:00Z`).toISOString();
}

export const eventItemIdSchema = z.string().uuid();

import { z } from "zod";

const optionalDate = z
  .union([z.literal(""), z.iso.date()])
  .transform((value) => (value === "" ? null : value));

const optionalDescription = z
  .string()
  .transform((value) => (value.trim() === "" ? null : value))
  .refine((value) => value === null || value.length <= 10_000, {
    message: "Description must be 10,000 characters or fewer.",
  });

const optionalCoverPath = z
  .string()
  .transform((value) => value.trim() || null);

export const eventFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Enter an event title.")
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
    description: optionalDescription,
    start_date: optionalDate,
    end_date: optionalDate,
    cover_image_path: optionalCoverPath,
    visibility: z.enum(["private", "public"], {
      error: "Choose a visibility.",
    }),
  })
  .superRefine((event, context) => {
    if (
      event.start_date !== null &&
      event.end_date !== null &&
      event.end_date < event.start_date
    ) {
      context.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "End date must be the same as or later than the start date.",
      });
    }
  });

export type EventFormValues = {
  title: string;
  slug: string;
  description: string;
  start_date: string;
  end_date: string;
  cover_image_path: string;
  visibility: string;
};

export type EventFormState = {
  message?: string;
  fieldErrors?: Partial<Record<keyof EventFormValues, string[]>>;
  values?: EventFormValues;
};

export const eventIdSchema = z.string().uuid();

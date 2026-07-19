import { z } from "zod";

const requiredText = (maximumLength: number) =>
  z.string().trim().min(1).max(maximumLength);
const nonEmptyText = z.string().trim().min(1);

export const idSchema = z.string().trim().min(1);

export const projectInputSchema = z
  .object({
    name: requiredText(200),
    client: nonEmptyText,
    category: z.enum(["tech", "consultancy", "agency", "agents"]),
    status: z.enum(["planning", "active", "on_hold", "completed"]),
    priority: z.enum(["high", "medium", "low"]),
    ownerId: nonEmptyText,
    memberIds: z.array(nonEmptyText),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    notes: z.string().optional(),
  })
  .refine((project) => project.endDate >= project.startDate, {
    message: "End date must be on or after start date.",
    path: ["endDate"],
  });

export const milestoneInputSchema = z.object({
  name: requiredText(200),
  dueDate: z.coerce.date(),
  done: z.boolean(),
  assigneeId: idSchema,
});

export const personNameSchema = requiredText(100);

export const loginSchema = z.object({
  personId: idSchema,
  password: z.string().min(1),
});

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"],
  });

export const ideaSchema = requiredText(2_000);

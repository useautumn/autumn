import { z } from "zod/v4";

export const RedirectModeSchema = z.enum(["always", "if_required", "never"]);
export type RedirectMode = z.infer<typeof RedirectModeSchema>;

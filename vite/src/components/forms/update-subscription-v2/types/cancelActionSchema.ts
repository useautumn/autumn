import { z } from "zod/v4";

export const CancelActionSchema = z.enum([
	"cancel_immediately",
	"cancel_end_of_cycle",
]);
export type CancelActionValue = z.infer<typeof CancelActionSchema>;

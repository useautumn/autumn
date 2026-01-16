import z from "zod/v4";
import { FullCusProductSchema } from "../cusProductModels/cusProductModels";

// What happens to any SCHEDULED cus product
export const ScheduledCusProductActionSchema = z.object({
	action: z.literal("delete"),
	cusProduct: FullCusProductSchema,
});

export type ScheduledCusProductAction = z.infer<
	typeof ScheduledCusProductActionSchema
>;

import z from "zod/v4";
import { FullCusProductSchema } from "../cusProductModels/cusProductModels";

// What happens to the CURRENT active cus product
export const OngoingCusProductActionSchema = z.object({
	action: z.literal(["expire", "cancel", "uncancel"]),
	cusProduct: FullCusProductSchema,
});

// What happens to any SCHEDULED cus product
export const ScheduledCusProductActionSchema = z.object({
	action: z.literal("delete"),
	cusProduct: FullCusProductSchema,
});

export type OngoingCusProductAction = z.infer<
	typeof OngoingCusProductActionSchema
>;
export type ScheduledCusProductAction = z.infer<
	typeof ScheduledCusProductActionSchema
>;

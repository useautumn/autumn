import z from "zod/v4";
import { FullProductSchema } from "../productModels/productModels";

export const NewProductActionSchema = z.object({
	timing: z.literal(["scheduled", "immediate"]),
	product: FullProductSchema,
});

export const EnrichedNewProductActionSchema = NewProductActionSchema.extend({
	startsAt: z.number().default(Date.now()),
});

export type NewProductAction = z.infer<typeof NewProductActionSchema>;
export type EnrichedNewProductAction = z.infer<
	typeof EnrichedNewProductActionSchema
>;

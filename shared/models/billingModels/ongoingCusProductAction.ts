import z from "zod/v4";
import { FullCusProductSchema } from "../cusProductModels/cusProductModels";

// What happens to the CURRENT active cus product
export const OngoingCusProductActionSchema = z.object({
	action: z.literal(["expire", "cancel", "uncancel"]),
	cusProduct: FullCusProductSchema,
});
export type OngoingCusProductAction = z.infer<
	typeof OngoingCusProductActionSchema
>;

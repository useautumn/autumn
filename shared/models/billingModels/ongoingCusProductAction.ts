import z from "zod/v4";
import { FullCusProductSchema } from "../cusProductModels/cusProductModels";

export enum OngoingCusProductActionEnum {
	Expire = "expire",
	Cancel = "cancel",
	Uncancel = "uncancel",
	Update = "update",
}

// What happens to the CURRENT active cus product
export const OngoingCusProductActionSchema = z.object({
	action: z.enum(OngoingCusProductActionEnum),
	cusProduct: FullCusProductSchema,
});
export type OngoingCusProductAction = z.infer<
	typeof OngoingCusProductActionSchema
>;

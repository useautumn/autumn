import z from "zod/v4";
import {
	type OngoingCusProductAction,
	OngoingCusProductActionSchema,
	type ScheduledCusProductAction,
	ScheduledCusProductActionSchema,
} from "../attachModels/cusProductActions";
import {
	EnrichedNewProductActionSchema,
	type NewProductAction,
	NewProductActionSchema,
} from "./newProductAction";

export interface CusProductActions {
	ongoingCusProductAction?: OngoingCusProductAction;
	scheduledCusProductAction?: ScheduledCusProductAction;
	newProductActions: NewProductAction[];
}

export const CusProductActionsSchema = z.object({
	ongoingCusProductAction: OngoingCusProductActionSchema,
	scheduledCusProductAction: ScheduledCusProductActionSchema,
	newProductActions: z.array(NewProductActionSchema),
});

export const EnrichedCusProductActionsSchema = CusProductActionsSchema.extend({
	ongoingCusProductAction: OngoingCusProductActionSchema,
	scheduledCusProductAction: ScheduledCusProductActionSchema,
	newProductActions: z.array(EnrichedNewProductActionSchema),
});

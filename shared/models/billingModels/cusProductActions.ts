import z from "zod/v4";

import {
	EnrichedNewProductActionSchema,
	type NewProductAction,
	NewProductActionSchema,
} from "./newProductAction";
import {
	type OngoingCusProductAction,
	OngoingCusProductActionSchema,
} from "./ongoingCusProductAction";
import {
	type ScheduledCusProductAction,
	ScheduledCusProductActionSchema,
} from "./scheduledCusProductAction";

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

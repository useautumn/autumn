import { z } from "zod/v4";
import { ResetInterval } from "../../../models/productModels/intervals/resetInterval.js";

export const ApiEntityAllocationSchema = z.object({
	entity_id: z.string(),
	amount: z.number().meta({ description: "The requested amount." }),
	granted: z.number().meta({
		description:
			"What the entity holds now; below amount only while the shared credits can't cover every allocation.",
	}),
	usage: z.number(),
	remaining: z.number(),
	next_reset_at: z.number().nullable(),
});

export const ApiSharedAllocationTotalsSchema = z.object({
	granted: z.number(),
	remaining: z.number(),
	allocated: z.number(),
	unallocated: z.number(),
});

export const AllocateBalancesResponseSchema = z.object({
	customer_id: z.string(),
	feature_id: z.string(),
	interval: z.enum(ResetInterval),
	allocations: z.array(ApiEntityAllocationSchema),
	shared: ApiSharedAllocationTotalsSchema,
});

export type ApiEntityAllocation = z.infer<typeof ApiEntityAllocationSchema>;
export type AllocateBalancesResponse = z.infer<
	typeof AllocateBalancesResponseSchema
>;

import {
	FeatureSchema,
	FullCusProductSchema,
	FullCustomerEntitlementSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { MutationLogItemSchema } from "../../types/mutationLogItem.js";

// The facts a track command settled on. The shard returns these; the client
// shapes them into the API's TrackResponseV3.
export const TrackResultSchema = z.object({
	customer_id: z.string(),
	entity_id: z.string().optional(),
	event_name: z.string().optional(),
	value: z.number(),
	// The relevant-feature set the command resolved the deduction over.
	features: z.array(FeatureSchema),
	// Hoisted out of the rows: many entitlements share one customer product.
	customer_products: z.record(z.string(), FullCusProductSchema),
	customer_entitlements: z.array(FullCustomerEntitlementSchema),
	mutations: z.array(MutationLogItemSchema),
});

export type TrackResult = z.infer<typeof TrackResultSchema>;

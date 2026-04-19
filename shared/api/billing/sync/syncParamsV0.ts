import { z } from "zod/v4";
import { ProductItemSchema } from "../../../models/productV2Models/productItemModels/productItemModels";

export const SyncMappingV0Schema = z.object({
	stripe_subscription_id: z.string(),
	plan_id: z.string(),
	items: z.array(ProductItemSchema).optional(),
	expire_previous: z.boolean().optional(),
});

export const SyncParamsV0Schema = z.object({
	customer_id: z.string(),
	mappings: z.array(SyncMappingV0Schema),
});

export type SyncMappingV0 = z.infer<typeof SyncMappingV0Schema>;
export type SyncParamsV0 = z.infer<typeof SyncParamsV0Schema>;

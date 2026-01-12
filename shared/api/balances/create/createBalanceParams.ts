import { FeatureSchema, FeatureType, ResetInterval } from "@autumn/shared";
import { z } from "zod/v4";

export const CreateBalanceSchema = z.object({
	feature_id: z.string(),
	granted_balance: z.number().optional(),
	unlimited: z.boolean().optional(),
	reset: z
		.object({
			interval: z.enum(ResetInterval),
			interval_count: z.number().optional(),
		})
		.optional(),
	expires_at: z.number().optional(), // Unix timestamp in milliseconds
	customer_id: z.string(),
	entity_id: z.string().optional(),
}).refine((data) => {
	if (data.entity_id && !data.customer_id) {
		return false;
	} else return true;
});

export const ValidateCreateBalanceParamsSchema = CreateBalanceSchema.extend({
	feature: FeatureSchema,
}).refine((data) => {
	if (!data.feature) {
		return false;
	}

	if (data.feature.type === FeatureType.Boolean) {
		if (data.granted_balance !== undefined || data.unlimited || data.reset?.interval || data.expires_at) {
			return false;
		}
	}

	if (data.feature.type === FeatureType.Metered) {
		if (data.granted_balance === undefined && !data.unlimited) {
			return false;
		}
		if (data.granted_balance !== undefined && data.unlimited) {
			return false;
		}
		if (data.unlimited && data.reset?.interval) {
			return false;
		}
	}

	return true;
}).refine((data) => {
	// expires_at and reset interval are mutually exclusive (for all non-boolean feature types)
	if (data.expires_at && data.reset?.interval) {
		return false;
	}
	return true;
}, {
	message: "expires_at and reset interval are mutually exclusive - a balance cannot have both",
});

export type CreateBalanceParams = z.infer<typeof CreateBalanceSchema>;

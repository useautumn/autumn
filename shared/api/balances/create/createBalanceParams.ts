import { FeatureSchema, FeatureType, ResetInterval } from "@autumn/shared";
import { z } from "zod/v4";

export const CreateBalanceParamsSchema = z
	.object({
		feature_id: z.string(),
		customer_id: z.string(),
		entity_id: z.string().optional(),

		granted_balance: z.number().optional(),
		unlimited: z.boolean().optional(),
		reset: z
			.object({
				interval: z.enum(ResetInterval),
				interval_count: z.number().optional(),
			})
			.optional(),
		expires_at: z.number().optional(), // Unix timestamp in milliseconds
	})
	.refine((data) => {
		if (data.entity_id && !data.customer_id) {
			return false;
		} else return true;
	});

export const ValidateCreateBalanceParamsSchema =
	CreateBalanceParamsSchema.extend({
		feature: FeatureSchema,
	}).refine((data) => {
		if (!data.feature) {
			return false;
		}

		if (data.feature.type === FeatureType.Boolean) {
			if (
				data.granted_balance !== undefined ||
				data.unlimited ||
				data.reset?.interval
			) {
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
	});

export type CreateBalanceParams = z.infer<typeof CreateBalanceParamsSchema>;

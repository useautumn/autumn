import { z } from "zod/v4";
import { ApiBalanceBreakdownPriceSchema } from "./components/apiBalanceBreakdown/apiBalanceBreakdownV1.js";
import { BalanceBreakdownLegacyDataSchema } from "./components/apiBalanceBreakdown/balanceBreakdownLegacyData.js";

/**
 * Legacy data for balance/feature transforms
 * Contains ALL fields needed for:
 * - V2.1 → V2.0 transform (purchased_balance, plan_id)
 * - V2.0 → V1.2 transform (key, prepaid_quantity)
 * - V0 → V1 transform (price in breakdown)
 */
export const CusFeatureLegacyDataSchema = z.object({
	// For V2.0 → V1.2 transform
	key: z.string().nullable(),
	prepaid_quantity: z.number(),

	// For V2.1 → V2.0 transform
	purchased_balance: z.number(),
	plan_id: z.string().nullable(),

	// Breakdown legacy data with all fields for nested transforms
	breakdown_legacy_data: z.array(
		z
			.object({
				// For V2.0 → V1.2 transform
				key: z.string(),
				prepaid_quantity: z.number(),
				// For V2.1 → V2.0 transform
				id: z.string(),
				// For V0 → V1 transform (price only in V1)
				price: ApiBalanceBreakdownPriceSchema.nullable(),
			})
			.merge(BalanceBreakdownLegacyDataSchema),
	),
});

export type CusFeatureLegacyData = z.infer<typeof CusFeatureLegacyDataSchema>;

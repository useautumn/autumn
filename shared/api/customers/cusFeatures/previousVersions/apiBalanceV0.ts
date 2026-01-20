import { ApiBalanceBreakdownV0Schema } from "@api/customers/cusFeatures/components/apiBalanceBreakdown/prevVersions/apiBalanceBreakdownV0.js";
import { ApiBalanceResetV0Schema } from "@api/customers/cusFeatures/components/apiBalanceReset/apiBalanceResetV0.js";
import { ApiBalanceRolloverV0Schema } from "@api/customers/cusFeatures/components/apiBalanceRollover/apiBalanceRolloverV0.js";
import { z } from "zod/v4";
import { ApiFeatureV1Schema } from "../../../features/apiFeatureV1.js";

export const ApiBalanceV0Schema = z.object({
	feature_id: z.string(),
	feature: ApiFeatureV1Schema.optional(),
	unlimited: z.boolean(),

	granted_balance: z.number(),
	purchased_balance: z.number(),
	current_balance: z.number(),
	usage: z.number(),

	overage_allowed: z.boolean(),
	max_purchase: z.number().nullable(),
	reset: ApiBalanceResetV0Schema.nullable(),

	plan_id: z.string().nullable(),
	breakdown: z.array(ApiBalanceBreakdownV0Schema).optional(),
	rollovers: z.array(ApiBalanceRolloverV0Schema).optional(),
});

export type ApiBalanceV0 = z.infer<typeof ApiBalanceV0Schema>;

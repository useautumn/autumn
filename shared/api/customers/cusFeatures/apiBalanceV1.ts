import { ApiBalanceBreakdownV1Schema } from "@api/customers/cusFeatures/components/apiBalanceBreakdown/apiBalanceBreakdownV1.js";
import { ApiBalanceResetV0Schema } from "@api/customers/cusFeatures/components/apiBalanceReset/apiBalanceResetV0.js";
import { ApiBalanceRolloverV0Schema } from "@api/customers/cusFeatures/components/apiBalanceRollover/apiBalanceRolloverV0.js";
import { z } from "zod/v4";
import { ApiFeatureV1Schema } from "../../features/apiFeatureV1.js";

export const ApiBalanceV1Schema = z.object({
	feature_id: z.string(),
	feature: ApiFeatureV1Schema.optional(),
	unlimited: z.boolean(),

	granted: z.number(),
	balance: z.number(),
	usage: z.number(),

	overage_allowed: z.boolean(),
	max_purchase: z.number().nullable(),
	reset: ApiBalanceResetV0Schema.nullable(),

	breakdown: z.array(ApiBalanceBreakdownV1Schema).optional(),
	rollovers: z.array(ApiBalanceRolloverV0Schema).optional(),
});

export type ApiBalanceV1 = z.infer<typeof ApiBalanceV1Schema>;

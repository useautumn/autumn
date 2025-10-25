import { ApiFeatureType } from "@api/features/apiFeature.js";
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { resetIntvToEntIntv } from "@utils/planFeatureUtils/planFeatureIntervals.js";
import { nullish } from "@utils/utils.js";
import { Decimal } from "decimal.js";
import type { z } from "zod/v4";
import { ApiCusFeatureSchema } from "../apiCusFeature.js";
import {
	type ApiCusFeatureV3Breakdown,
	ApiCusFeatureV3Schema,
} from "../previousVersions/apiCusFeatureV3.js";
// overage_allowed: z.boolean().nullish().meta({
// 	description: "Whether overage usage beyond the limit is allowed",
// 	example: true,
// }),

/**
 * Transform feature from V2.0 format to V1.2 format
 * Exported so it can be reused in other transformations (e.g., V1_2_CustomerChange)
 */
export function transformCusFeatureToV3({
	input,
}: {
	input: z.infer<typeof ApiCusFeatureSchema>;
}): z.infer<typeof ApiCusFeatureV3Schema> {
	const toUsageLimit = ({
		maxPurchase,
		startingBalance,
	}: {
		maxPurchase?: number;
		startingBalance: number;
	}) => {
		return maxPurchase && startingBalance
			? new Decimal(maxPurchase).add(startingBalance).toNumber()
			: undefined;
	};

	const toV3Type = ({ type }: { type: ApiFeatureType }) => {
		if (type === ApiFeatureType.Boolean) {
			return ApiFeatureType.Static;
		} else return type;
	};

	const itemInterval =
		input.reset_interval === null
			? "multiple"
			: resetIntvToEntIntv({ resetIntv: input.reset_interval });

	const usageLimit = toUsageLimit({
		maxPurchase: input.max_purchase,
		startingBalance: input.starting_balance,
	});

	const overageAllowed =
		Boolean(input.pay_per_use) && nullish(input.max_purchase);

	let newBreakdown: ApiCusFeatureV3Breakdown[] | undefined;
	if (input.breakdown && input.breakdown.length > 0) {
		newBreakdown = input.breakdown.map((breakdown) => {
			const interval = resetIntvToEntIntv({
				resetIntv: breakdown.reset_interval,
			});

			const usageLimit = toUsageLimit({
				maxPurchase: breakdown.max_purchase,
				startingBalance: breakdown.starting_balance,
			});

			return {
				interval,
				interval_count: breakdown.reset_interval_count || 1,

				balance: breakdown.balance,
				usage: breakdown.usage,
				included_usage: breakdown.starting_balance,
				next_reset_at: breakdown.resets_at,
				usage_limit: usageLimit,
			} satisfies ApiCusFeatureV3Breakdown;
		});
	}

	const v3Type = toV3Type({
		type: input.feature?.type ?? ApiFeatureType.SingleUsage,
	});

	const omitInterval = v3Type === ApiFeatureType.Static || input.unlimited;

	return {
		id: input.feature_id,
		type: v3Type,

		name: input.feature?.name ?? null,
		unlimited: input.unlimited,

		included_usage: input.starting_balance,
		balance: input.balance,
		usage: input.usage,
		next_reset_at: input.resets_at,

		interval: omitInterval ? undefined : itemInterval,
		interval_count: omitInterval
			? undefined
			: itemInterval === "multiple"
				? null
				: input.reset_interval_count || 1,

		overage_allowed: overageAllowed,

		credit_schema: input.feature?.credit_schema
			? input.feature.credit_schema.map((credit) => ({
					feature_id: credit.metered_feature_id,
					credit_amount: credit.credit_cost,
				}))
			: undefined,

		breakdown: newBreakdown,
		usage_limit: usageLimit,
		rollovers: input.rollovers,
	};
}

/**
 * V1_2_CusFeatureChange: Transforms customer feature response TO V1_2 format
 *
 * Applied when: targetVersion <= V1_2
 *
 * Breaking changes introduced in V2.0:
 *
 * 1. Simplified schema with minimal required fields
 * 2. Optional feature object for expanded data
 * 3. Removed verbose metadata and display fields
 *
 * Input: ApiCusFeature (V2.0+ format)
 * Output: ApiCusFeatureV3 (V1.2 format)
 */
export const V1_2_CusFeatureChange = defineVersionChange({
	newVersion: ApiVersion.V2,
	oldVersion: ApiVersion.V1_2,
	description: [
		"Simplified customer feature schema",
		"Added optional feature object",
		"Removed verbose fields",
	],
	affectedResources: [AffectedResource.Customer],
	newSchema: ApiCusFeatureSchema,
	oldSchema: ApiCusFeatureV3Schema,

	transformResponse: transformCusFeatureToV3,
});

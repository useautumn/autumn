import { type ApiFeature, ApiFeatureType } from "@api/features/apiFeature.js";
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { Decimal } from "decimal.js";
import type { z } from "zod/v4";
import { EntInterval } from "../../../../models/productModels/entModels/entEnums.js";
import { resetIntvToEntIntv } from "../../../../utils/planFeatureUtils/planFeatureIntervals.js";
import {
	type ApiBalance,
	type ApiBalanceBreakdown,
	ApiBalanceSchema,
} from "../apiBalance.js";
import {
	type CusFeatureLegacyData,
	CusFeatureLegacyDataSchema,
} from "../cusFeatureLegacyData.js";
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

const resetToV3IntervalParams = ({
	input,
	feature,
	unlimited,
}: {
	input: ApiBalance | ApiBalanceBreakdown;
	feature?: ApiFeature;
	unlimited: boolean;
}): {
	interval: EntInterval | "multiple" | null;
	interval_count: number | null;
	next_reset_at: number | null;
} => {
	const isBoolean = feature?.type === ApiFeatureType.Boolean;

	// 1. No reset
	if (!input.reset)
		return {
			interval: null,
			interval_count: isBoolean || unlimited ? null : 1,
			next_reset_at: null,
		};

	// 2. Multiple interval
	if (input.reset?.interval === "multiple") {
		return {
			interval: "multiple",
			interval_count: null,
			next_reset_at: null,
		};
	}

	// 3. Single interval
	return {
		interval: resetIntvToEntIntv({ resetIntv: input.reset?.interval }),
		interval_count: input.reset?.interval_count || 1,
		next_reset_at: input.reset?.resets_at,
	};
};

const toV3Type = ({ feature }: { feature?: ApiFeature }) => {
	if (feature?.type === ApiFeatureType.Boolean) {
		return ApiFeatureType.Static;
	} else return feature?.type ?? ApiFeatureType.SingleUsage;
};

const toV3BalanceParams = ({
	input,
	feature,
	unlimited,
	legacyData,
}: {
	input: ApiBalance | ApiBalanceBreakdown;
	feature?: ApiFeature;
	unlimited: boolean;
	legacyData?: CusFeatureLegacyData;
}) => {
	const isBoolean = feature?.type === ApiFeatureType.Boolean;

	if (isBoolean || unlimited) {
		return {
			includedUsage: 0,
			balance: 0,
			usage: 0,
			overageAllowed: false,
			usageLimit: undefined,
		};
	}

	const prepaidQuantity = legacyData?.prepaid_quantity ?? 0;
	const overage = new Decimal(input.purchased_balance)
		.sub(prepaidQuantity)
		.toNumber();

	// 1. Get included usage
	const includedUsage = new Decimal(input.granted_balance)
		.add(prepaidQuantity)
		.toNumber();

	// 2. Balance
	const balance = new Decimal(input.current_balance).sub(overage).toNumber();

	// 3. Usage
	const usage = new Decimal(input.usage).toNumber();

	// 4. Overage allowed
	let overageAllowed = input.overage_allowed ?? false;
	if (overageAllowed && input.max_purchase) {
		overageAllowed = false;
	}

	// 5. Usage limit

	const usageLimit = input.max_purchase
		? new Decimal(input.max_purchase).add(includedUsage).toNumber()
		: undefined;

	return { includedUsage, balance, usage, overageAllowed, usageLimit };
};

export function transformBalanceToCusFeatureV3({
	input,
	legacyData,
}: {
	input: z.infer<typeof ApiBalanceSchema>;
	legacyData?: CusFeatureLegacyData;
}): z.infer<typeof ApiCusFeatureV3Schema> {
	// 1. Is boolean feature

	const feature = input.feature;
	const isUnlimited = input.unlimited;

	const { interval, interval_count, next_reset_at } = resetToV3IntervalParams({
		input,
		feature,
		unlimited: isUnlimited,
	});

	const { includedUsage, balance, usage, overageAllowed, usageLimit } =
		toV3BalanceParams({
			input,
			feature,
			unlimited: isUnlimited,
			legacyData,
		});

	let newBreakdown: ApiCusFeatureV3Breakdown[] | undefined;
	if (input.breakdown && input.breakdown.length > 0) {
		newBreakdown = input.breakdown.map((breakdown) => {
			// const interval = resetIntvToEntIntv({
			// 	resetIntv: breakdown.reset_interval,
			// });
			const { interval, interval_count, next_reset_at } =
				resetToV3IntervalParams({
					input: breakdown,
					feature,
					unlimited: isUnlimited,
				});

			const { includedUsage, balance, usage, overageAllowed, usageLimit } =
				toV3BalanceParams({
					input: breakdown,
					feature,
					unlimited: isUnlimited,
					legacyData,
				});

			return {
				interval:
					interval === "multiple" || !interval ? EntInterval.Month : interval,

				interval_count: interval_count,

				balance: balance,
				usage: usage,
				included_usage: includedUsage,
				next_reset_at: next_reset_at,
				usage_limit: usageLimit,
				overage_allowed: overageAllowed,
			} satisfies ApiCusFeatureV3Breakdown;
		});
	}

	// 1. Included usage: granted_balance, or if prepaid, granted_balance + purchased_balance (?)

	return {
		id: input.feature_id,
		type: toV3Type({ feature }),

		name: input.feature?.name ?? null,
		unlimited: input.unlimited,

		included_usage: includedUsage,
		balance: balance,
		usage: usage,

		usage_limit: usageLimit,

		interval: interval,
		interval_count: interval_count,
		next_reset_at: next_reset_at,

		overage_allowed: overageAllowed,

		credit_schema: input.feature?.credit_schema
			? input.feature.credit_schema.map((credit) => ({
					feature_id: credit.metered_feature_id,
					credit_amount: credit.credit_cost,
				}))
			: undefined,

		breakdown: newBreakdown,
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
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_2,
	description: [
		"Simplified customer feature schema",
		"Added optional feature object",
		"Removed verbose fields",
	],
	affectedResources: [AffectedResource.Customer],
	newSchema: ApiBalanceSchema,
	oldSchema: ApiCusFeatureV3Schema,
	legacyDataSchema: CusFeatureLegacyDataSchema,

	transformResponse: transformBalanceToCusFeatureV3,
});

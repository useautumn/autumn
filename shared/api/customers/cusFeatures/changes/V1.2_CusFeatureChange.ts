import { ApiFeatureType } from "@api/features/prevVersions/apiFeatureV0.js";
import type { EntInterval } from "@models/productModels/intervals/entitlementInterval.js";
import { resetIntvToEntIntv } from "@utils/productV2Utils/productItemUtils/convertProductItem/planItemIntervals.js";
import { Decimal } from "decimal.js";
import type { z } from "zod/v4";
import { FeatureType } from "../../../../models/featureModels/featureEnums.js";
import { sumValues } from "../../../../utils/utils.js";
import type { ApiFeatureV1 } from "../../../features/apiFeatureV1.js";
import type {
	ApiBalance,
	ApiBalanceBreakdown,
	ApiBalanceSchema,
} from "../apiBalance.js";
import type {
	ApiCusFeatureV3Breakdown,
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
	feature?: ApiFeatureV1;
	unlimited: boolean;
}): {
	interval: EntInterval | "multiple" | null;
	interval_count: number | null;
	next_reset_at: number | null;
} => {
	const isBoolean = feature?.type === FeatureType.Boolean;

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

const toV3Type = ({ feature }: { feature?: ApiFeatureV1 }) => {
	if (feature?.type === FeatureType.Boolean) {
		return ApiFeatureType.Static;
	} else if (feature?.type === FeatureType.Metered) {
		if (feature.consumable) {
			return ApiFeatureType.SingleUsage;
		} else {
			return ApiFeatureType.ContinuousUse;
		}
	} else if (feature?.type === FeatureType.CreditSystem) {
		return ApiFeatureType.SingleUsage;
	} else {
		return ApiFeatureType.Static;
	}
};

const toV3BalanceParams = ({
	input,
	feature,
	unlimited,
	isBreakdown = false,
}: {
	input: ApiBalance | ApiBalanceBreakdown;
	feature?: ApiFeatureV1;
	unlimited: boolean;
	isBreakdown?: boolean;
}) => {
	const isBoolean = feature?.type === FeatureType.Boolean;

	if (isBoolean || unlimited) {
		return {
			includedUsage: 0,
			balance: 0,
			usage: 0,
			overageAllowed: false,
			usageLimit: undefined,
		};
	}

	let prepaidQuantity = 0;

	if (isBreakdown) {
		prepaidQuantity = (input as ApiBalanceBreakdown).prepaid_quantity ?? 0;
	} else {
		prepaidQuantity = sumValues(
			(input as ApiBalance).breakdown?.map((b) => b.prepaid_quantity ?? 0) ??
				[],
		);
	}

	let overage = 0;
	if (isBreakdown) {
		overage = input.overage_allowed
			? new Decimal(input.purchased_balance).toNumber()
			: 0;
	} else {
		overage = new Decimal(input.purchased_balance)
			.sub(prepaidQuantity)
			.toNumber();
	}

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

	// 6. Expires at
	const expiresAt =
		"expires_at" in input ? (input as ApiBalanceBreakdown).expires_at : null;

	return {
		includedUsage,
		balance,
		usage,
		overageAllowed,
		usageLimit,
		expiresAt,
	};
};

export function transformBalanceToCusFeatureV3({
	input,
}: {
	input: z.infer<typeof ApiBalanceSchema>;
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

			const {
				includedUsage,
				balance,
				usage,
				overageAllowed,
				usageLimit,
				expiresAt,
			} = toV3BalanceParams({
				input: breakdown,
				feature,
				unlimited: isUnlimited,
				isBreakdown: true,
			});

			return {
				interval: interval === "multiple" || !interval ? null : interval,

				interval_count: interval_count,

				balance: balance,
				usage: usage,
				included_usage: includedUsage,
				next_reset_at: next_reset_at,
				usage_limit: usageLimit,
				overage_allowed: overageAllowed,
				expires_at: expiresAt,
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

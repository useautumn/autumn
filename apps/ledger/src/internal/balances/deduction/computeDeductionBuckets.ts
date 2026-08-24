import type { CustomerEntitlementDeduction } from "./types/customerEntitlementDeduction.js";
import type { DeductionBucket } from "./types/deductionBucket.js";
import type { DeductionOptions } from "./types/deductionOptions.js";

// Consumption pass 2 skips rows that cannot go negative, but `allow` promotes
// every row to usage-allowed first (runDeductionOnContextV2.lua:87).
const takesOverage = ({
	row,
	options,
}: {
	row: CustomerEntitlementDeduction;
	options: DeductionOptions;
}): boolean => row.usage_allowed || options.isAllow;

const spendBuckets = ({
	rows,
	options,
}: {
	rows: CustomerEntitlementDeduction[];
	options: DeductionOptions;
}): DeductionBucket[] => [
	...rows.map(
		(customerEntitlementDeduction): DeductionBucket => ({
			customerEntitlementDeduction,
			kind: "spend_included",
			limit: 0,
		}),
	),
	...rows
		.filter((row) => takesOverage({ row, options }))
		.map(
			(customerEntitlementDeduction): DeductionBucket => ({
				customerEntitlementDeduction,
				kind: "spend_overage",
				limit: options.isAllow
					? null
					: (customerEntitlementDeduction.min_balance ?? null),
			}),
		),
];

// Refunds never skip a row: the script sets skip_if_not_usage_allowed to
// `not is_refund` (runDeductionOnContextV2.lua:470).
const refundBuckets = ({
	rows,
	options,
}: {
	rows: CustomerEntitlementDeduction[];
	options: DeductionOptions;
}): DeductionBucket[] => [
	...rows.map(
		(customerEntitlementDeduction): DeductionBucket => ({
			customerEntitlementDeduction,
			kind: "refund_overage",
			limit: 0,
		}),
	),
	...rows.map(
		(customerEntitlementDeduction): DeductionBucket => ({
			customerEntitlementDeduction,
			kind: "refund_included",
			limit: options.isAllow
				? null
				: (customerEntitlementDeduction.max_balance ?? null),
		}),
	),
];

// The pass order as data. Row 66: an unlimited leader is an infinite sink — one
// unclamped pass, and its finite siblings never see the amount
// (runDeductionOnContextV2.lua:388-414).
export const computeDeductionBuckets = ({
	rows,
	amount,
	options,
}: {
	rows: CustomerEntitlementDeduction[];
	amount: number;
	options: DeductionOptions;
}): DeductionBucket[] => {
	const [leader] = rows;
	if (leader?.unlimited) {
		return [
			{ customerEntitlementDeduction: leader, kind: "unlimited", limit: null },
		];
	}

	return amount < 0
		? refundBuckets({ rows, options })
		: spendBuckets({ rows, options });
};

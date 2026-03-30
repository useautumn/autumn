import type { ApiSpendLimit } from "@api/billingControls";
import type { ApiSubjectV0 } from "@api/customers/apiSubjectV0";
import { apiSubjectToSpendLimit } from "@api/customers/utils/apiSubjectToSpendLimit";
import type { Feature } from "@models/featureModels/featureModels";
import { sumValues } from "@utils/utils";
import { Decimal } from "decimal.js";
import type { ApiBalanceBreakdownV1, ApiBalanceV1 } from "../../apiBalanceV1";
import { apiBalanceV1ToOverage } from "./apiBalanceV1ToOverage";

const NOT_USAGE_BASED = -1;

/**
 * Returns the max overage for a single breakdown item.
 * - Usage-based: returns `max_purchase` (number) or `undefined` if uncapped.
 * - Non-usage-based (free/prepaid/lifetime): returns `NOT_USAGE_BASED` sentinel
 *   so the caller can distinguish "not relevant" from "capped at 0" (`max_purchase: 0`).
 */
export const apiBalanceBreakdownV1ToMaxOverage = ({
	apiBalanceBreakdown,
}: {
	apiBalanceBreakdown: ApiBalanceBreakdownV1;
}): number | undefined => {
	if (apiBalanceBreakdown.price?.billing_method === "usage_based") {
		return apiBalanceBreakdown.price?.max_purchase ?? undefined;
	}

	return NOT_USAGE_BASED;
};

/**
 * Aggregates max overage across all breakdowns for a balance.
 * Only usage-based breakdowns contribute; non-usage breakdowns are ignored.
 * Returns `undefined` when there are no usage-based breakdowns or any
 * usage-based breakdown has no `max_purchase` (meaning overage is uncapped).
 */
export const apiBalanceV1ToMaxOverage = ({
	apiBalance,
}: {
	apiBalance: ApiBalanceV1;
}): number | undefined => {
	const breakdownItems = apiBalance.breakdown ?? [];

	const usageBasedOverages = breakdownItems
		.map((item) =>
			apiBalanceBreakdownV1ToMaxOverage({ apiBalanceBreakdown: item }),
		)
		.filter((value) => value !== NOT_USAGE_BASED);

	if (usageBasedOverages.length === 0) return undefined;

	if (usageBasedOverages.some((overage) => overage === undefined)) {
		return undefined;
	}

	return sumValues(usageBasedOverages.filter((v) => v !== undefined));
};

export type AvailableOverageResult = {
	availableOverage: number | undefined;
	reason?: "spend_limit" | "max_purchase";
};

export const apiBalanceV1ToAvailableOverage = ({
	apiBalance,
	apiSubject,
	feature,
}: {
	apiBalance: ApiBalanceV1;
	apiSubject: ApiSubjectV0;
	feature: Feature;
}): AvailableOverageResult => {
	const overage = apiBalanceV1ToOverage({ apiBalance });
	const spendLimit: ApiSpendLimit | undefined = apiSubject
		? apiSubjectToSpendLimit({
				subject: apiSubject,
				feature,
			})
		: undefined;

	if (spendLimit?.overage_limit !== undefined) {
		return {
			availableOverage: Math.max(
				0,
				new Decimal(spendLimit.overage_limit).sub(overage).toNumber(),
			),
			reason: "spend_limit",
		};
	}

	const maxOverage = apiBalanceV1ToMaxOverage({ apiBalance });

	if (maxOverage === undefined) {
		return { availableOverage: undefined };
	}

	return {
		availableOverage: Math.max(
			0,
			new Decimal(maxOverage).sub(overage).toNumber(),
		),
		reason: "max_purchase",
	};
};

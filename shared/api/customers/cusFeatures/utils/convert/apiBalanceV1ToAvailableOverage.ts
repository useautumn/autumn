import type { ApiSpendLimit } from "@api/billingControls";
import type { ApiSubjectV0 } from "@api/customers/apiSubjectV0";
import { apiSubjectToSpendLimit } from "@api/customers/utils/apiSubjectToSpendLimit";
import type { Feature } from "@models/featureModels/featureModels";
import { sumValues } from "@utils/utils";
import { Decimal } from "decimal.js";
import type { ApiBalanceBreakdownV1, ApiBalanceV1 } from "../../apiBalanceV1";
import { apiBalanceV1ToOverage } from "./apiBalanceV1ToOverage";

export const apiBalanceBreakdownV1ToMaxOverage = ({
	apiBalanceBreakdown,
}: {
	apiBalanceBreakdown: ApiBalanceBreakdownV1;
}): number | undefined => {
	if (apiBalanceBreakdown.price?.billing_method === "usage_based") {
		return apiBalanceBreakdown.price?.max_purchase ?? undefined;
	}

	return 0;
};

export const apiBalanceV1ToMaxOverage = ({
	apiBalance,
}: {
	apiBalance: ApiBalanceV1;
}): number | undefined => {
	const breakdownItems = apiBalance.breakdown ?? [];

	const availableOverages = breakdownItems.map((item) =>
		apiBalanceBreakdownV1ToMaxOverage({ apiBalanceBreakdown: item }),
	);

	if (availableOverages.some((overage) => overage === undefined)) {
		return undefined;
	}

	return sumValues(
		availableOverages.filter((overage) => overage !== undefined),
	);
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

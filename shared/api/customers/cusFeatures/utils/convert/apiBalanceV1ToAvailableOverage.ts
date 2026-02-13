import { apiBalanceV1ToOverage } from "@api/customers/cusFeatures/utils/convert/apiBalanceV1ToOverage.js";
import { BillingMethod } from "@api/products/components/billingMethod.js";
import { sumValues } from "@utils/utils.js";
import { Decimal } from "decimal.js";
import type {
	ApiBalanceBreakdownV1,
	ApiBalanceV1,
} from "../../apiBalanceV1.js";

export const apiBalanceBreakdownV1ToMaxOverage = ({
	apiBalanceBreakdown,
}: {
	apiBalanceBreakdown: ApiBalanceBreakdownV1;
}): number | undefined => {
	if (apiBalanceBreakdown.price?.billing_method === BillingMethod.UsageBased) {
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

export const apiBalanceV1ToAvailableOverage = ({
	apiBalance,
}: {
	apiBalance: ApiBalanceV1;
}): number | undefined => {
	const maxOverage = apiBalanceV1ToMaxOverage({ apiBalance });
	const overage = apiBalanceV1ToOverage({ apiBalance });

	if (maxOverage === undefined) {
		return undefined;
	}

	return Math.max(0, new Decimal(maxOverage).sub(overage).toNumber());
};

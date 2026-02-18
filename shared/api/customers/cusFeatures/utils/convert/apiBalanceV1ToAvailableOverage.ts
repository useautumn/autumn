import { Decimal } from "decimal.js";
import type {
	ApiBalanceBreakdownInput,
	ApiBalanceInput,
} from "./apiBalanceToAllowed";
import { apiBalanceV1ToOverage } from "./apiBalanceV1ToOverage";

const sumValues = (values: number[]) =>
	values.reduce((total, value) => total + value, 0);

export const apiBalanceBreakdownV1ToMaxOverage = ({
	apiBalanceBreakdown,
}: {
	apiBalanceBreakdown: ApiBalanceBreakdownInput;
}): number | undefined => {
	if (apiBalanceBreakdown.price?.billing_method === "usage_based") {
		return apiBalanceBreakdown.price?.max_purchase ?? undefined;
	}

	return 0;
};

export const apiBalanceV1ToMaxOverage = ({
	apiBalance,
}: {
	apiBalance: ApiBalanceInput;
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
	apiBalance: ApiBalanceInput;
}): number | undefined => {
	const maxOverage = apiBalanceV1ToMaxOverage({ apiBalance });
	const overage = apiBalanceV1ToOverage({ apiBalance });

	if (maxOverage === undefined) {
		return undefined;
	}

	return Math.max(0, new Decimal(maxOverage).sub(overage).toNumber());
};

import type { ApiBalanceBreakdownV1, ApiBalanceV1 } from "@api/models";
import { sumValues } from "@utils/utils";
import Decimal from "decimal.js";

export const apiBalanceBreakdownV1ToOverage = ({
	apiBalanceBreakdown,
}: {
	apiBalanceBreakdown: ApiBalanceBreakdownV1;
}) => {
	return new Decimal(apiBalanceBreakdown.usage)
		.sub(apiBalanceBreakdown.included_grant)
		.sub(apiBalanceBreakdown.prepaid_grant)
		.toNumber();
};

export const apiBalanceV1ToOverage = ({
	apiBalance,
}: {
	apiBalance: ApiBalanceV1;
}) => {
	const breakdownItems = apiBalance.breakdown ?? [];

	// Sum per-breakdown overage (clamped to 0 each) to preserve historical overage
	// when additional granted balance is added from other products
	return sumValues(
		breakdownItems.map((item) =>
			Math.max(0, apiBalanceBreakdownV1ToOverage({ apiBalanceBreakdown: item })),
		),
	);
};

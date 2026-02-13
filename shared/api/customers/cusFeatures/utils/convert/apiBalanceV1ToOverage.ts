import { sumValues } from "@utils/utils.js";
import { Decimal } from "decimal.js";
import type {
	ApiBalanceBreakdownV1,
	ApiBalanceV1,
} from "../../apiBalanceV1.js";

export const apiBalanceBreakdownV1ToOverage = ({
	apiBalanceBreakdown,
}: {
	apiBalanceBreakdown: ApiBalanceBreakdownV1;
}) => {
	// Overage = usage beyond what was granted and prepaid, clamped to 0
	return Math.max(
		0,
		new Decimal(apiBalanceBreakdown.usage)
			.sub(apiBalanceBreakdown.included_grant)
			.sub(apiBalanceBreakdown.prepaid_grant)
			.toNumber(),
	);
};

export const apiBalanceV1ToOverage = ({
	apiBalance,
}: {
	apiBalance: ApiBalanceV1;
}) => {
	const breakdownItems = apiBalance.breakdown ?? [];

	// Sum per-breakdown overage to preserve historical overage
	// when additional granted balance is added from other products
	return sumValues(
		breakdownItems.map((item) =>
			apiBalanceBreakdownV1ToOverage({ apiBalanceBreakdown: item }),
		),
	);
};

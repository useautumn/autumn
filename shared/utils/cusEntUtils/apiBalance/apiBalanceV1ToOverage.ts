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

	const totalGranted = sumValues(
		breakdownItems.map((item) => item.included_grant),
	);
	const totalPrepaid = sumValues(
		breakdownItems.map((item) => item.prepaid_grant),
	);
	const totalUsage = sumValues(breakdownItems.map((item) => item.usage));

	const totalOverage = Math.max(
		0,
		new Decimal(totalUsage).sub(totalGranted).sub(totalPrepaid).toNumber(),
	);

	return totalOverage;
};

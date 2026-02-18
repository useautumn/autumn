import type {
	ApiBalanceBreakdownInput,
	ApiBalanceInput,
} from "./apiBalanceToAllowed";

const sumValues = (values: number[]) =>
	values.reduce((total, value) => total + value, 0);

export const apiBalanceBreakdownV1ToOverage = ({
	apiBalanceBreakdown,
}: {
	apiBalanceBreakdown: ApiBalanceBreakdownInput;
}) => {
	// const overage = Math.max(
	// 	0,
	// 	new Decimal(apiBalanceBreakdown.usage)
	// 		.sub(apiBalanceBreakdown.included_grant)
	// 		.sub(apiBalanceBreakdown.prepaid_grant)
	// 		.toNumber(),
	// );

	return apiBalanceBreakdown.overage ?? 0;
};

export const apiBalanceV1ToOverage = ({
	apiBalance,
}: {
	apiBalance: ApiBalanceInput;
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

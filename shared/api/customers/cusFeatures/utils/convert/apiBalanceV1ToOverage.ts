import { sumValues } from "@utils/utils";
import type { ApiBalanceBreakdownV1, ApiBalanceV1 } from "../../apiBalanceV1";

export const apiBalanceBreakdownV1ToOverage = ({
	apiBalanceBreakdown,
}: {
	apiBalanceBreakdown: ApiBalanceBreakdownV1;
}) => {
	return apiBalanceBreakdown.overage ?? 0;
};

export const apiBalanceV1ToOverage = ({
	apiBalance,
}: {
	apiBalance: ApiBalanceV1;
}) => {
	const breakdownItems = apiBalance.breakdown ?? [];

	return sumValues(
		breakdownItems.map((item) =>
			apiBalanceBreakdownV1ToOverage({ apiBalanceBreakdown: item }),
		),
	);
};

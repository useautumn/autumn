import type { ApiBalanceV1 } from "@api/models";
import { sumValues } from "@utils/utils";

export const apiBalanceV1ToPrepaidQuantity = ({
	apiBalance,
}: {
	apiBalance: ApiBalanceV1;
}) => {
	const breakdownItems = apiBalance.breakdown ?? [];

	const totalPrepaid = sumValues(
		breakdownItems.map((item) => item.prepaid_grant),
	);

	return totalPrepaid;
};

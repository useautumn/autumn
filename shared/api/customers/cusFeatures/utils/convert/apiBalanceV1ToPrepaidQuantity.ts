import { sumValues } from "@utils/utils";
import type { ApiBalanceV1 } from "../../apiBalanceV1";

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

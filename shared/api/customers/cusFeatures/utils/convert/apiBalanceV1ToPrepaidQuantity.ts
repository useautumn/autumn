import { sumValues } from "@utils/utils.js";
import type { ApiBalanceV1 } from "../../apiBalanceV1.js";

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

import type { ApiBalanceBreakdownV1, ApiBalanceV1 } from "@api/models";
import {
	apiBalanceBreakdownV1ToOverage,
	apiBalanceV1ToOverage,
} from "@utils/cusEntUtils/apiBalance/apiBalanceV1ToOverage";
import { apiBalanceV1ToPrepaidQuantity } from "@utils/cusEntUtils/apiBalance/apiBalanceV1ToPrepaidQuantity";
import { Decimal } from "decimal.js";

export const apiBalanceBreakdownV1ToPurchasedBalance = ({
	apiBalanceBreakdown,
}: {
	apiBalanceBreakdown: ApiBalanceBreakdownV1;
}) => {
	return new Decimal(apiBalanceBreakdownV1ToOverage({ apiBalanceBreakdown }))
		.add(apiBalanceBreakdown.prepaid_grant)
		.toNumber();
};

export const apiBalanceV1ToPurchasedBalance = ({
	apiBalance,
}: {
	apiBalance: ApiBalanceV1;
}) => {
	const totalOverage = apiBalanceV1ToOverage({ apiBalance });
	const totalPrepaid = apiBalanceV1ToPrepaidQuantity({ apiBalance });
	return new Decimal(totalOverage).add(totalPrepaid).toNumber();
};

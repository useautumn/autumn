import { Decimal } from "decimal.js";
import type {
	ApiBalanceBreakdownV1,
	ApiBalanceV1,
} from "../../apiBalanceV1.js";
import {
	apiBalanceBreakdownV1ToOverage,
	apiBalanceV1ToOverage,
} from "./apiBalanceV1ToOverage.js";
import { apiBalanceV1ToPrepaidQuantity } from "./apiBalanceV1ToPrepaidQuantity.js";

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

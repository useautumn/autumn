import { ResetInterval } from "@models/productModels/intervals/resetInterval";
import { sumValues } from "@utils/utils";
import type { ApiBalanceBreakdownV1, ApiBalanceV1 } from "../../apiBalanceV1";

const isRecurringBreakdownItem = (item: ApiBalanceBreakdownV1): boolean =>
	item.reset != null && item.reset.interval !== ResetInterval.OneOff;

/** Included plus prepaid grants on entries that reset; one-off grants are left out. */
export const apiBalanceV1ToRecurringGrant = ({
	apiBalance,
}: {
	apiBalance: ApiBalanceV1;
}): number =>
	sumValues(
		(apiBalance.breakdown ?? [])
			.filter(isRecurringBreakdownItem)
			.flatMap((item) => [item.included_grant, item.prepaid_grant]),
	);

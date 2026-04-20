import type { ApiBalanceV1 } from "@autumn/shared";
import { roundCacheBalance } from "@/internal/customers/cache/fullSubject/roundCacheBalance.js";

/**
 * Round all numeric balance fields on an ApiBalanceV1 to eliminate
 * floating-point drift from Lua 5.1 double arithmetic.
 */
export const roundApiBalance = ({
	apiBalance,
}: {
	apiBalance: ApiBalanceV1;
}): ApiBalanceV1 => {
	apiBalance.granted = roundCacheBalance(apiBalance.granted);
	apiBalance.remaining = roundCacheBalance(apiBalance.remaining);
	apiBalance.usage = roundCacheBalance(apiBalance.usage);

	if (apiBalance.breakdown) {
		for (const item of apiBalance.breakdown) {
			item.included_grant = roundCacheBalance(item.included_grant);
			item.prepaid_grant = roundCacheBalance(item.prepaid_grant);
			item.remaining = roundCacheBalance(item.remaining);
			item.usage = roundCacheBalance(item.usage);
		}
	}

	return apiBalance;
};

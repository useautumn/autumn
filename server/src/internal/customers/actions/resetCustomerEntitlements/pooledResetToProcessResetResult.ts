import type { PooledCustomerEntitlementReset } from "@/internal/billing/v2/pooledBalances/reset/resetPooledCustomerEntitlements.js";
import type { ProcessResetResult } from "./processReset.js";

export const pooledResetToProcessResetResult = ({
	pooledReset,
}: {
	pooledReset: PooledCustomerEntitlementReset;
}): ProcessResetResult => ({
	updates: {
		balance: pooledReset.balance,
		additional_balance: 0,
		adjustment: pooledReset.adjustment,
		entities: null,
		next_reset_at: pooledReset.nextResetAt,
	},
	...(pooledReset.rolloverInsert
		? { rolloverInsert: pooledReset.rolloverInsert }
		: {}),
});

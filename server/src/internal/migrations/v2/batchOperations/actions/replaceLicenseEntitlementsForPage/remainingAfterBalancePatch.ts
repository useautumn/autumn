import { Decimal } from "decimal.js";
import type { CustomerEntitlementPatch } from "@/internal/billing/v2/actions/batchTransition/types/entitlementPriceOperationTypes.js";

export const remainingAfterBalancePatch = ({
	liveBalance,
	patch,
}: {
	liveBalance: number | null;
	patch: CustomerEntitlementPatch;
}): number | null => {
	const balance = patch.balance;
	if (!balance) return liveBalance;
	if (balance.type === "set") return balance.amount;
	if (liveBalance === null) return null;
	return new Decimal(liveBalance).plus(balance.amount).toNumber();
};

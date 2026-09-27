import type { EntitlementPrice } from "@autumn/shared";
import type { InitCustomerEntitlementFields } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementFields";

export type CustomerEntitlementBalancePatch =
	| { type: "increment"; amount: number }
	| { type: "set"; amount: number };

export type CustomerEntitlementPatch = {
	balance?: CustomerEntitlementBalancePatch;
	unlimited?: boolean | null;
};

export type PooledContributionPatch = {
	type: "increment" | "set";
	amount: number;
};

export type ReplaceEntitlementPriceOperation = {
	type: "replace";
	fromEntitlementIds: string[];
	toEntitlementId: string;
	fromEntitlementPrice: EntitlementPrice;
	toEntitlementPrice: EntitlementPrice;
	customerEntitlementPatch: CustomerEntitlementPatch;
	/** Present when both sides are pooled: source balance stays 0; contributions
	 * and the shared pool either carry by Δ or reset to the incoming grant. */
	pooledContributionPatch?: PooledContributionPatch;
};

export type PooledAddSpec = {
	contributionAmount: number;
	pooledBalanceId: string;
};

export type AddEntitlementPriceOperation = {
	type: "add";
	entitlementPrice: EntitlementPrice;
	existingEntitlementIds: string[];
	customerEntitlement: InitCustomerEntitlementFields;
	/** Present when the added entitlement is pooled: sources stay at 0. */
	pooledAdd?: PooledAddSpec;
};

export type RemoveEntitlementPriceOperation = {
	type: "remove";
	entitlementPrice: EntitlementPrice;
	fromEntitlementIds: string[];
};

export type EntitlementPriceOperation =
	| ReplaceEntitlementPriceOperation
	| AddEntitlementPriceOperation
	| RemoveEntitlementPriceOperation;

import type { EntitlementPrice } from "@autumn/shared";
import type { InitCustomerEntitlementFields } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementFields";

export type CustomerEntitlementBalancePatch =
	| { type: "increment"; amount: number }
	| { type: "set"; amount: number };

export type CustomerEntitlementPatch = {
	balance?: CustomerEntitlementBalancePatch;
	unlimited?: boolean | null;
};

export type ReplaceEntitlementPriceOperation = {
	type: "replace";
	fromEntitlementIds: string[];
	toEntitlementId: string;
	fromEntitlementPrice: EntitlementPrice;
	toEntitlementPrice: EntitlementPrice;
	customerEntitlementPatch: CustomerEntitlementPatch;
};

export type AddEntitlementPriceOperation = {
	type: "add";
	entitlementPrice: EntitlementPrice;
	existingEntitlementIds: string[];
	customerEntitlement: InitCustomerEntitlementFields;
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

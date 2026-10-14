import type {
	EntInterval,
	EntitlementPrice,
	PooledBalanceResetMode,
} from "@autumn/shared";
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
	pooledContributionPatch?: PooledContributionPatch;
};

export type PooledAddIdentity = {
	internalCustomerId: string;
	internalFeatureId: string;
	unlimited: boolean;
	interval: EntInterval;
	intervalCount: number;
	resetMode: PooledBalanceResetMode;
	stripeSubscriptionId: null;
	customerLicenseLinkId: string;
	rolloverSignature: string;
};

export type PooledAddSpec = {
	contributionAmount: number;
	identity: PooledAddIdentity;
	pooledBalanceId?: string;
};

export type AddEntitlementPriceOperation = {
	type: "add";
	entitlementPrice: EntitlementPrice;
	existingEntitlementIds: string[];
	customerEntitlement: InitCustomerEntitlementFields;
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

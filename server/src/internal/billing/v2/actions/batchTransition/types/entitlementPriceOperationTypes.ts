import type {
	EntInterval,
	EntitlementPrice,
	PooledBalanceResetMode,
	RolloverConfig,
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
	type: "increment";
	amount: number;
};

export type ReplaceEntitlementPriceOperation = {
	type: "replace";
	fromEntitlementIds: string[];
	toEntitlementId: string;
	fromEntitlementPrice: EntitlementPrice;
	toEntitlementPrice: EntitlementPrice;
	customerEntitlementPatch: CustomerEntitlementPatch;
	/** Present when both sides are pooled: source balance stays 0; Δ goes to contributions + pool. */
	pooledContributionPatch?: PooledContributionPatch;
};

export type PooledAddIdentity = {
	internalCustomerId: string;
	internalFeatureId: string;
	unlimited: boolean;
	interval: EntInterval;
	intervalCount: number;
	resetCycleAnchor: number | null;
	resetMode: PooledBalanceResetMode;
	stripeSubscriptionId: null;
	customerLicenseLinkId: string;
	rolloverSignature: string;
};

export type PooledAddSpec = {
	contributionAmount: number;
	identity: PooledAddIdentity;
	nextResetAt: number | null;
	featureId: string;
	rollover: RolloverConfig | null;
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

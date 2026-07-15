import type {
	CancelAction,
	CarryOverUsages,
	Entitlement,
	FullCusProduct,
	FullCustomerEntitlement,
	FullCustomerPrice,
	FullProduct,
	Price,
	StripeBillingContextOverride,
} from "@autumn/shared";
import type { BillingContext, BillingVersion } from "./billingContext";

export enum UpdateSubscriptionIntent {
	UpdateQuantity = "update_quantity",
	UpdatePlan = "update_plan",
	CancelAction = "cancel_action",
	/** Add credits to a one-off prepaid item hosted on a paid-recurring cusProduct. */
	ManualTopUp = "manual_top_up",
	None = "none",
}

export type PatchContext = {
	originalCustomerProduct: FullCusProduct;
	mode: "new" | "existing";
	finalCustomerProduct: FullCusProduct;
	fullProduct: FullProduct;
	insertCustomerPrices: FullCustomerPrice[];
	insertCustomerEntitlements: FullCustomerEntitlement[];
	deleteCustomerPrices: FullCustomerPrice[];
	deleteCustomerEntitlements: FullCustomerEntitlement[];
	customPrices: Price[];
	customEntitlements: Entitlement[];
	/** Explicit source-to-replacement entitlement carries for items whose identity changes. */
	updateItemCarryLinks: {
		fromCustomerEntitlementId: string;
		toEntitlementId: string;
	}[];
};

export interface UpdateSubscriptionBillingContext extends BillingContext {
	customerProduct: FullCusProduct; // target customer product
	patchContext?: PatchContext;
	defaultProduct?: FullProduct; // for cancel flows
	cancelAction?: CancelAction; // for cancel flows
	recalculateBalances?: boolean;

	intent: UpdateSubscriptionIntent;

	/**
	 * Mirror of `UpdateSubscriptionBillingContextOverride.chargeExistingOverages`.
	 * Read by `computeCustomPlan` to decide whether to call
	 * `buildAutumnLineItems` with `includeArrearLineItems: true`.
	 */
	chargeExistingOverages?: boolean;

	/**
	 * Mirror of `UpdateSubscriptionBillingContextOverride.skipExistingUsageCarry`.
	 * Read by `computeCustomPlanNewCustomerProduct` to decide whether to carry
	 * consumable usages forward when initializing the new customer_product.
	 */
	skipExistingUsageCarry?: boolean;

	/** Customer-facing `carry_over_usages` param; resolved into the carry config per reader. */
	carryOverUsages?: CarryOverUsages;

	/**
	 * Set by migrations-v2's `update_plan` operation when `op.proration === true`.
	 * Lets `evaluateMigrateCustomerStripe` skip its no-charge guard for this
	 * subscription only — every other migration keeps the guard.
	 */
	allowCharges?: boolean;
}

export interface UpdateSubscriptionBillingContextOverrides {
	productContext?: {
		fullProduct: FullProduct;
		customerProduct: FullCusProduct;
		customPrices: Price[];
		customEnts: Entitlement[];
	};

	stripeBillingContext?: StripeBillingContextOverride;

	billingVersion?: BillingVersion;
}

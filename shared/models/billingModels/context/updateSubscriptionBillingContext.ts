import type {
	CancelAction,
	Entitlement,
	FullCusProduct,
	FullProduct,
	Price,
	StripeBillingContextOverride,
} from "@autumn/shared";
import type { BillingContext, BillingVersion } from "./billingContext";

export enum UpdateSubscriptionIntent {
	UpdateQuantity = "update_quantity",
	UpdatePlan = "update_plan",
	CancelAction = "cancel_action",
	None = "none",
}
export interface UpdateSubscriptionBillingContext extends BillingContext {
	customerProduct: FullCusProduct; // target customer product
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

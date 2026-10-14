import type {
	CancelAction,
	CarryOverUsages,
	Entitlement,
	FullCusProduct,
	FullCustomerEntitlement,
	FullCustomerLicense,
	FullCustomerPrice,
	FullProduct,
	InsertPlanLicenseSpec,
	Price,
	StripeBillingContextOverride,
} from "@autumn/shared";
import type { BillingContext, BillingVersion } from "./billingContext";

export enum UpdateSubscriptionIntent {
	UpdateQuantity = "update_quantity",
	UpdatePlan = "update_plan",
	CancelAction = "cancel_action",
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
	insertCustomerLicenses?: FullCustomerLicense[];
	deleteCustomerPrices: FullCustomerPrice[];
	deleteCustomerEntitlements: FullCustomerEntitlement[];
	customPrices: Price[];
	customEntitlements: Entitlement[];
	updateItemCarryLinks: {
		fromCustomerEntitlementId: string;
		toEntitlementId: string;
	}[];
};

export interface UpdateSubscriptionBillingContext extends BillingContext {
	customerProduct: FullCusProduct;
	patchContext?: PatchContext;
	defaultProduct?: FullProduct;
	cancelAction?: CancelAction;
	recalculateBalances?: boolean;

	intent: UpdateSubscriptionIntent;

	insertPlanLicenses?: InsertPlanLicenseSpec[];

	chargeExistingOverages?: boolean;

	skipExistingUsageCarry?: boolean;

	carryOverUsages?: CarryOverUsages;

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

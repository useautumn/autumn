import type { InsertPlanLicenseSpec } from "@autumn/shared";
import type Stripe from "stripe";
import type { CarryOverUsages } from "../../../api/billing/common/carryOverUsages";
import type {
	SyncParamsV1,
	SyncPlanInstance,
} from "../../../api/billing/sync/syncParamsV1";
import type { Entity } from "../../cusModels/entityModels/entityModels";
import type { FullCustomer } from "../../cusModels/fullCusModel";
import type {
	FeatureOptions,
	FullCusProduct,
} from "../../cusProductModels/cusProductModels";
import type { Entitlement } from "../../productModels/entModels/entModels";
import type { Price } from "../../productModels/priceModels/priceModels";
import type { FullProduct } from "../../productModels/productModels";
import type { CustomerLicenseQuantity } from "../customerLicenseQuantity";

export interface SyncProductContext {
	plan: SyncPlanInstance;
	fullProduct: FullProduct;
	customPrices: Price[];
	customEntitlements: Entitlement[];
	featureQuantities: FeatureOptions[];
	customerLicenseQuantities?: CustomerLicenseQuantity[];
	insertPlanLicenses?: InsertPlanLicenseSpec[];
	entity?: Entity;
	currentCustomerProduct?: FullCusProduct;
	accessStartsAt?: number;
}

export interface SyncPhaseContext {
	startsAt: number;
	endsAt: number | null;
	productContexts: SyncProductContext[];
}

export interface SyncBillingContext {
	customer_id: string;
	fullCustomer: FullCustomer;

	stripeSubscription: Stripe.Subscription | null;
	stripeSchedule: Stripe.SubscriptionSchedule | null;
	currency: string;

	immediatePhase: SyncPhaseContext | null;
	futurePhases: SyncPhaseContext[];
	unscheduledProductContexts: SyncProductContext[];
	retainedCustomerProducts: FullCusProduct[];
	queuedCustomerProducts: FullCusProduct[];

	currentEpochMs: number;
	acknowledgedWarnings: NonNullable<SyncParamsV1["acknowledge_warnings"]>;

	expireUnlistedPlans: boolean;

	carryOverUsage: boolean;

	carryOverUsages?: CarryOverUsages;
}

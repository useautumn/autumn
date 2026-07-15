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

export interface SyncProductContext {
	plan: SyncPlanInstance;
	fullProduct: FullProduct;
	customPrices: Price[];
	customEntitlements: Entitlement[];
	featureQuantities: FeatureOptions[];
	/** Resolved per-plan entity scope (from plan.entity_id), if any. */
	entity?: Entity;
	/** Existing active cusProduct in the same product group, if `expire_previous` was set. */
	currentCustomerProduct?: FullCusProduct;
	accessStartsAt?: number;
}

export interface SyncPhaseContext {
	/** Resolved phase start in ms epoch. `"now"` is materialized to `currentEpochMs`. */
	startsAt: number;
	/** Resolved phase end in ms epoch — equals the next phase's `startsAt`, or null for the final phase. */
	endsAt: number | null;
	productContexts: SyncProductContext[];
}

export interface SyncBillingContext {
	customer_id: string;
	fullCustomer: FullCustomer;

	stripeSubscription: Stripe.Subscription | null;
	stripeSchedule: Stripe.SubscriptionSchedule | null;
	/** Effective billing currency used by every normalized Stripe item. */
	currency: string;

	/** First phase if its `starts_at` was `"now"`, else null. */
	immediatePhase: SyncPhaseContext | null;
	/** Remaining phases (or all phases if there is no immediate phase). */
	futurePhases: SyncPhaseContext[];

	currentEpochMs: number;
	acknowledgedWarnings: NonNullable<SyncParamsV1["acknowledge_warnings"]>;

	/** Carry an expired plan's consumed usage onto the replacement plan's
	 * balances for shared features on the same subject. Defaults to true. */
	carryOverUsage: boolean;

	/** Inherited org transition-rule carry config; undefined = carry all consumables. */
	carryOverUsages?: CarryOverUsages;
}

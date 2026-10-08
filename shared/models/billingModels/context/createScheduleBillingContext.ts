import type {
	CustomerLicenseQuantity,
	Entitlement,
	Entity,
	FeatureOptions,
	InsertPlanLicenseSpec,
	Price,
} from "@autumn/shared";
import type { PhaseProrationBehavior } from "../../../api/billing/common/billingBehavior";
import type { CarryOverUsages } from "../../../api/billing/common/carryOverUsages";
import type { ResolvedCreateSchedulePhaseV0 } from "../../../api/billing/createSchedule/createScheduleParamsV0";
import type { FullProduct } from "../../productModels/productModels";
import type { MultiAttachBillingContext } from "./multiAttachBillingContext";

export interface ScheduledProductContext {
	fullProduct: FullProduct;
	customPrices: Price[];
	customEntitlements: Entitlement[];
	featureQuantities: FeatureOptions[];
	customerLicenseQuantities?: CustomerLicenseQuantity[];
	insertPlanLicenses?: InsertPlanLicenseSpec[];
	/** User-provided subscription ID for this scheduled product. */
	externalId?: string;
	/**
	 * Scope inherited from the opening phase's plan in the same group.
	 * Undefined means customer-level, not "unscoped" — callers must not fall
	 * back to the request entity.
	 */
	entity?: Entity;
}

export interface ScheduledPhaseContext {
	startsAt: number;
	endsAt: number | undefined;
	billingCycleAnchor?: "phase_start";
	prorationBehavior?: PhaseProrationBehavior;
	productContexts: ScheduledProductContext[];
}

/** The one Stripe subscription a request edits when the customer has several. */
export interface StripeSubscriptionScope {
	stripeSubscriptionId: string;
	/** Plans on the subscription or its schedule, plus customer-wide free plans. */
	customerProductIds: string[];
	otherStripeSubscriptionIds: string[];
}

export interface CreateScheduleBillingContext
	extends MultiAttachBillingContext {
	immediatePhase: ResolvedCreateSchedulePhaseV0;
	futurePhases: ResolvedCreateSchedulePhaseV0[];
	scheduledPhaseContexts: ScheduledPhaseContext[];
	/** When every plan ends, unscheduled plans included; Stripe cancels the subscription then. */
	endsAt?: number;
	/** Set when the request targets one subscription; nothing outside it may change. */
	stripeSubscriptionScope?: StripeSubscriptionScope;
	/** The request's carry_over_usages, else the org's transition rule. */
	carryOverUsages?: CarryOverUsages;
	/** The old trial end a trial ended now or backdated anchors on, when the request names no anchor. */
	trialEndAnchorMs?: number;
}

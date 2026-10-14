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
	externalId?: string;
	entity?: Entity;
}

export interface ScheduledPhaseContext {
	startsAt: number;
	endsAt: number | undefined;
	billingCycleAnchor?: "phase_start";
	prorationBehavior?: PhaseProrationBehavior;
	productContexts: ScheduledProductContext[];
}

export interface StripeSubscriptionScope {
	stripeSubscriptionId: string;
	customerProductIds: string[];
	otherStripeSubscriptionIds: string[];
}

export interface CreateScheduleBillingContext
	extends MultiAttachBillingContext {
	immediatePhase: ResolvedCreateSchedulePhaseV0;
	futurePhases: ResolvedCreateSchedulePhaseV0[];
	scheduledPhaseContexts: ScheduledPhaseContext[];
	endsAt?: number;
	stripeSubscriptionScope?: StripeSubscriptionScope;
	carryOverUsages?: CarryOverUsages;
	trialEndAnchorMs?: number;
}

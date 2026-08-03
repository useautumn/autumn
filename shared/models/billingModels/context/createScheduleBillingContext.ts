import type {
	Entitlement,
	Entity,
	FeatureOptions,
	Price,
} from "@autumn/shared";
import type {
	CreateSchedulePhaseV0,
	ResolvedCreateSchedulePhaseV0,
} from "../../../api/billing/createSchedule/createScheduleParamsV0";
import type { FullProduct } from "../../productModels/productModels";
import type {
	MultiAttachBillingContext,
	MultiAttachProductContext,
} from "./multiAttachBillingContext";

export interface ScheduledProductContext {
	fullProduct: FullProduct;
	customPrices: Price[];
	customEntitlements: Entitlement[];
	featureQuantities: FeatureOptions[];
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
	billingCycleAnchor?: CreateSchedulePhaseV0["billing_cycle_anchor"];
	productContexts: ScheduledProductContext[];
}

export interface CreateScheduleBillingContext
	extends MultiAttachBillingContext {
	/**
	 * Customer products the replaced schedule put in place. Dropping one from the
	 * new phases expires it; products no schedule ever placed are left alone.
	 */
	replacedScheduleCustomerProductIds: string[];
	/**
	 * Immediate-phase contexts billed now that the schedule leaves alone: they
	 * never get an end date and never join a phase's customer products.
	 */
	unscheduledProductContexts: MultiAttachProductContext[];
	immediatePhase: ResolvedCreateSchedulePhaseV0;
	futurePhases: ResolvedCreateSchedulePhaseV0[];
	scheduledPhaseContexts: ScheduledPhaseContext[];
}

import type { Entitlement, FeatureOptions, Price } from "@autumn/shared";
import type { ResolvedCreateSchedulePhaseV0 } from "../../../api/billing/createSchedule/createScheduleParamsV0";
import type { FullProduct } from "../../productModels/productModels";
import type { MultiAttachBillingContext } from "./multiAttachBillingContext";

export interface ScheduledProductContext {
	fullProduct: FullProduct;
	customPrices: Price[];
	customEntitlements: Entitlement[];
	featureQuantities: FeatureOptions[];
	/** User-provided subscription ID for this scheduled product. */
	externalId?: string;
}

export interface ScheduledPhaseContext {
	startsAt: number;
	endsAt: number | undefined;
	productContexts: ScheduledProductContext[];
}

export interface CreateScheduleBillingContext
	extends MultiAttachBillingContext {
	immediatePhase: ResolvedCreateSchedulePhaseV0;
	futurePhases: ResolvedCreateSchedulePhaseV0[];
	scheduledPhaseContexts: ScheduledPhaseContext[];
}

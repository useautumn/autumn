import type { Entitlement, FeatureOptions, Price } from "@autumn/shared";
import type { CreateScheduleParamsV0 } from "../../../api/billing/createSchedule/createScheduleParamsV0";
import type { FullProduct } from "../../productModels/productModels";
import type { MultiAttachBillingContext } from "./multiAttachBillingContext";

type CreateSchedulePhase = CreateScheduleParamsV0["phases"][number];

export interface ScheduledProductContext {
	fullProduct: FullProduct;
	customPrices: Price[];
	customEntitlements: Entitlement[];
	featureQuantities: FeatureOptions[];
}

export interface ScheduledPhaseContext {
	startsAt: number;
	endsAt: number | undefined;
	productContexts: ScheduledProductContext[];
}

export interface CreateScheduleBillingContext
	extends MultiAttachBillingContext {
	immediatePhase: CreateSchedulePhase;
	futurePhases: CreateSchedulePhase[];
	scheduledPhaseContexts: ScheduledPhaseContext[];
}

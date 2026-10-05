import type {
	CustomerLicenseQuantity,
	FeatureOptions,
	FullProduct,
	PhaseProrationBehavior,
} from "@autumn/shared";
import type { DesiredSegmentSource } from "../../types/timelineSegment";

/** One plan as the request lists it, before it is placed on an instance. */
export type RequestedPlan = {
	fullProduct: FullProduct;
	featureQuantities: FeatureOptions[];
	customerLicenseQuantities?: CustomerLicenseQuantity[];
	internalEntityId: string | null;
	externalId?: string;
	/** Listed in unscheduled_plans: runs from now until the schedule ends. */
	ongoing: boolean;
	source: DesiredSegmentSource;
};

export type RequestedPhase = {
	startsAt: number;
	resetsBillingCycle: boolean;
	prorationBehavior: PhaseProrationBehavior | null;
	plans: RequestedPlan[];
};

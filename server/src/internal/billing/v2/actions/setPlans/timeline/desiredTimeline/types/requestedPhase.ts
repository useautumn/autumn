import type {
	CustomerLicenseQuantity,
	FeatureOptions,
	FullProduct,
} from "@autumn/shared";
import type { DesiredSegmentSource } from "../../types/timelineSegment";

export type RequestedPlan = {
	fullProduct: FullProduct;
	featureQuantities: FeatureOptions[];
	customerLicenseQuantities?: CustomerLicenseQuantity[];
	internalEntityId: string | null;
	externalId?: string;
	ongoing: boolean;
	source: DesiredSegmentSource;
};

export type RequestedPhase = {
	startsAt: number;
	resetsBillingCycle: boolean;
	plans: RequestedPlan[];
};

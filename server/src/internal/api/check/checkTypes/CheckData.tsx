import { Feature, ApiCusFeature } from "@autumn/shared";

export interface CheckData {
	customerId: string;
	entityId?: string;
	cusFeature?: ApiCusFeature
	originalFeature: Feature;
	featureToUse: Feature;
}
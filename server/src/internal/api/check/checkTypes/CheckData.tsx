import { Feature, ApiCusFeature } from "@autumn/shared";

export interface CheckData {
	customerId: string;
	entityId?: string;
	// apiCustomer: ApiCustomer;
	cusFeature?: ApiCusFeature
	// cusEnts: FullCusEntWithFullCusProduct[];
	originalFeature: Feature;
	featureToUse: Feature;
	// cusProducts: FullCusProduct[];
	// entity?: Entity;
}
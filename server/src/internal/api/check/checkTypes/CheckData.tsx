import type { ApiBalanceV1, Feature } from "@autumn/shared";

export interface CheckData {
	customerId: string;
	entityId?: string;
	apiBalance?: ApiBalanceV1;
	originalFeature: Feature;
	featureToUse: Feature;
}

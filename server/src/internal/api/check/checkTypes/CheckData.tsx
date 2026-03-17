import type { ApiBalanceV1, ApiCustomerV5, ApiEntityV2, ApiFlagV0, Feature } from "@autumn/shared";

export interface CheckData {
	customerId: string;
	entityId?: string;
	apiBalance?: ApiBalanceV1;
	apiFlag?: ApiFlagV0;
	apiSubject: ApiCustomerV5 | ApiEntityV2;
	originalFeature: Feature;
	featureToUse: Feature;
}

import type { ApiBalanceV1, CusFeatureLegacyData, Feature } from "@autumn/shared";

export interface CheckData {
	customerId: string;
	entityId?: string;
	apiBalance?: ApiBalanceV1;
	originalFeature: Feature;
	featureToUse: Feature;
	cusFeatureLegacyData?: CusFeatureLegacyData;
}

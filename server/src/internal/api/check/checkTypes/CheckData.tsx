import type { ApiBalanceV0, CusFeatureLegacyData, Feature } from "@autumn/shared";

export interface CheckData {
	customerId: string;
	entityId?: string;
	apiBalance?: ApiBalanceV0;
	originalFeature: Feature;
	featureToUse: Feature;
	cusFeatureLegacyData?: CusFeatureLegacyData;
}

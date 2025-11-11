import type { ApiBalance, CusFeatureLegacyData, Feature } from "@autumn/shared";

export interface CheckData {
	customerId: string;
	entityId?: string;
	apiBalance?: ApiBalance;
	originalFeature: Feature;
	featureToUse: Feature;
	cusFeatureLegacyData?: CusFeatureLegacyData;
}

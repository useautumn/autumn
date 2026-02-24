import { apiSubscriptionV1ToPurchaseV0 } from "@api/customers/cusPlans/mappers/apiSubscriptionV1ToPurchaseV0";

export * from "./apiSubscription";
export * from "./apiSubscriptionV1";
export * from "./cusProductLegacyData";
export * from "./mappers/apiSubscriptionV1ToPurchaseV0";
export * from "./mappers/apiSubscriptionV1ToV0";
export * from "./previousVersions/apiCusProductV0";
export * from "./previousVersions/apiCusProductV1";
export * from "./previousVersions/apiCusProductV2";
export * from "./previousVersions/apiCusProductV3";

export const apiSubscription = {
	map: {
		v1ToPurchaseV0: apiSubscriptionV1ToPurchaseV0,
	},
};

import { featureOptionsToV2StripeQuantity } from "@utils/cusProductUtils/featureOptionUtils/convertFeatureOptions";
import { featureOptionsToCustomerEntitlement } from "@utils/cusProductUtils/featureOptionUtils/convertFeatureOptions/featureOptionsToCustomerEntitlement";
import { featureOptionsToPrice } from "@utils/cusProductUtils/featureOptionUtils/convertFeatureOptions/featureOptionsToPrice";

export const featureOptionUtils = {
	convert: {
		toV2StripeQuantity: featureOptionsToV2StripeQuantity,
		toPrice: featureOptionsToPrice,
		toCustomerEntitlement: featureOptionsToCustomerEntitlement,
	},
};

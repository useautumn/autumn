import { isConsumableFeature } from "@shared/utils/featureUtils/classifyFeature/isConsumableFeature";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams";

export const setupLegacyTransitionContext = ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	const consumableFeatures = attachParams.products
		.flatMap((product) => product.entitlements)
		.filter((ent) => isConsumableFeature(ent.feature))
		.map((ent) => ent.feature);

	return {
		resetAfterTrialEndFeatureIds: consumableFeatures.map((f) => f.id),
	};
};

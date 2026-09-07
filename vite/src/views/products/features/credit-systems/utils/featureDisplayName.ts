import type { Feature } from "@autumn/shared";
import { findFeatureById, getFeatureName } from "@autumn/shared";

export const featureDisplayName = ({
	features,
	featureId,
	plural = false,
	capitalize = false,
}: {
	features: Feature[];
	featureId: string;
	plural?: boolean;
	capitalize?: boolean;
}) =>
	getFeatureName({
		feature: findFeatureById({ features, featureId, errorOnNotFound: false }),
		plural,
		capitalize,
	}) || featureId;

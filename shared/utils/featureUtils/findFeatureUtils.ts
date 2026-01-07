import { InternalError } from "@autumn/shared";
import type { Feature } from "@models/featureModels/featureModels";

// Overload: errorOnNotFound = true → guaranteed Feature
export function findFeatureByInternalId(params: {
	features: Feature[];
	internalId: string;
	errorOnNotFound: true;
}): Feature;

// Overload: errorOnNotFound = false/undefined → Feature | undefined
export function findFeatureByInternalId(params: {
	features: Feature[];
	internalId: string;
	errorOnNotFound?: false;
}): Feature | undefined;

// Implementation
export function findFeatureByInternalId({
	features,
	internalId,
	errorOnNotFound,
}: {
	features: Feature[];
	internalId: string;
	errorOnNotFound?: boolean;
}): Feature | undefined {
	const result = features.find((feature) => feature.internal_id === internalId);

	if (errorOnNotFound && !result) {
		throw new InternalError({
			message: `Feature not found for internal_id: ${internalId}`,
		});
	}

	return result;
}

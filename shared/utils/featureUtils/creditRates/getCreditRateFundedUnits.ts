import { Decimal } from "decimal.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import type { EventProperties } from "../creditDimensions/matchesEventProperties.js";
import { featureToCreditSystem } from "./getCreditCost.js";

/** How many of `requestedUnits` the available credits fund at this system's rate; bisects graduated tiers. */
export const getCreditRateFundedUnits = ({
	featureId,
	creditSystem,
	currentUsage,
	requestedUnits,
	availableCredits,
	eventProperties,
}: {
	featureId: string;
	creditSystem: Feature;
	currentUsage: number;
	requestedUnits: number;
	availableCredits: number;
	eventProperties?: EventProperties;
}): number => {
	if (requestedUnits <= 0) return 0;
	const requestedCredits = featureToCreditSystem({
		featureId,
		creditSystem,
		amount: requestedUnits,
		currentUsage,
		eventProperties,
	});
	if (requestedCredits <= availableCredits) return requestedUnits;
	if (availableCredits <= 0) return 0;

	let lowerBound = 0;
	let upperBound = requestedUnits;
	for (let iteration = 0; iteration < 60; iteration++) {
		const candidateUnits = new Decimal(lowerBound)
			.add(upperBound)
			.div(2)
			.toNumber();
		const candidateCredits = featureToCreditSystem({
			featureId,
			creditSystem,
			amount: candidateUnits,
			currentUsage,
			eventProperties,
		});
		if (candidateCredits <= availableCredits) {
			lowerBound = candidateUnits;
		} else {
			upperBound = candidateUnits;
		}
	}

	return lowerBound;
};

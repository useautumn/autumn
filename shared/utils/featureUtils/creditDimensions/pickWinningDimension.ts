import type { CreditDimension } from "../../../models/featureModels/featureConfig/creditConfig.js";
import {
	type EventProperties,
	matchesEventProperties,
} from "./matchesEventProperties.js";

const specificity = (dimension: CreditDimension) =>
	Object.keys(dimension.match).length;

const priorityRank = (dimension: CreditDimension) =>
	dimension.priority ?? Number.NEGATIVE_INFINITY;

export const pickWinningDimension = ({
	dimensions,
	eventProperties,
}: {
	dimensions: Record<string, CreditDimension>;
	eventProperties: EventProperties;
}): [string, CreditDimension] | undefined =>
	Object.entries(dimensions)
		.filter(([, dimension]) =>
			matchesEventProperties({ match: dimension.match, eventProperties }),
		)
		.sort(
			([leftName, left], [rightName, right]) =>
				specificity(right) - specificity(left) ||
				priorityRank(right) - priorityRank(left) ||
				leftName.localeCompare(rightName),
		)[0];

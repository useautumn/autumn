import type { CreditDimension } from "@autumn/shared";
import {
	type EventProperties,
	matchesEventProperties,
} from "./matchesEventProperties.js";

const specificity = (dimension: CreditDimension) =>
	Object.keys(dimension.match).length;

/** Most match keys wins, then the higher priority, then the name — so the choice is total. */
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
				(right.priority ?? 0) - (left.priority ?? 0) ||
				leftName.localeCompare(rightName),
		)[0];

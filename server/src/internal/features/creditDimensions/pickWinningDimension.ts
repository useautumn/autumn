import type { CreditDimension } from "@autumn/shared";
import {
	type EventProperties,
	matchesEventProperties,
} from "./matchesEventProperties.js";

const specificity = (dimension: CreditDimension) =>
	Object.keys(dimension.match).length;

// An omitted priority is its own rank, not 0: validation treats the two as
// different, so the resolver must order them the same way.
const priorityRank = (dimension: CreditDimension) =>
	dimension.priority ?? Number.NEGATIVE_INFINITY;

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
				priorityRank(right) - priorityRank(left) ||
				leftName.localeCompare(rightName),
		)[0];

import {
	type CreditDimension,
	type EventProperties,
	usageLimitFilterMatchesProperties,
} from "@autumn/shared";

export type { EventProperties };

// An empty match applies to every event, so a missing property bag still matches it.
export const matchesEventProperties = ({
	match,
	eventProperties,
}: {
	match: CreditDimension["match"];
	eventProperties: EventProperties;
}): boolean =>
	usageLimitFilterMatchesProperties({
		filterProperties: match,
		eventProperties: eventProperties ?? {},
	});

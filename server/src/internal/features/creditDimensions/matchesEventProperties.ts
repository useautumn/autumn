import {
	type CreditDimension,
	usageLimitFilterMatchesProperties,
} from "@autumn/shared";

export type EventProperties = Record<string, unknown> | undefined;

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

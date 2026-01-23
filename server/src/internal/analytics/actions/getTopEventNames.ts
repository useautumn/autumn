import { type Feature, FeatureType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { eventRepo } from "../repos/eventRepo.js";

export const getTopEventNames = async ({
	ctx,
	limit = 3,
}: {
	ctx: AutumnContext;
	limit?: number;
}): Promise<{
	featureIds: string[];
	eventNames: string[];
}> => {
	const { features } = ctx;

	const topEvents = await eventRepo.getTopEventNames({
		ctx,
		limit: 10, // Fetch more than needed to account for filtering
	});

	const featureIds: string[] = [];
	const eventNames: string[] = [];

	for (const row of topEvents) {
		const eventName = row.event_name;

		// Check if it's an event name associated with a metered feature
		const isMeteredEventName = features.some(
			(feature: Feature) =>
				feature.type === FeatureType.Metered &&
				feature.event_names &&
				feature.event_names.includes(eventName),
		);

		if (isMeteredEventName) {
			eventNames.push(eventName);
		} else if (features.some((feature: Feature) => feature.id === eventName)) {
			featureIds.push(eventName);
		}

		// Stop once we have enough results
		if (featureIds.length + eventNames.length >= limit) break;
	}

	return { featureIds, eventNames };
};

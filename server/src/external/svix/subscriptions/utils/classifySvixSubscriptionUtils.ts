import type { AppEnv, Organization } from "@autumn/shared";
import { listSvixEndpoints } from "../operations/listSvixEndpoints.js";

type SvixEndpointLike = { filterTypes?: string[] | null };

/** An endpoint with no filter types receives every event. */
export const endpointReceivesEvent = ({
	endpoint,
	eventType,
}: {
	endpoint: SvixEndpointLike;
	eventType: string;
}): boolean => {
	const filterTypes = endpoint.filterTypes ?? [];
	return filterTypes.length === 0 || filterTypes.includes(eventType);
};

/** Whether the org has any endpoint listening for `eventType`. */
export const isSubscribedToEvent = async ({
	org,
	env,
	eventType,
}: {
	org: Organization;
	env: AppEnv;
	eventType: string;
}): Promise<boolean> => {
	const endpoints = (await listSvixEndpoints({ org, env })) ?? [];
	return endpoints.some((endpoint) =>
		endpointReceivesEvent({ endpoint, eventType }),
	);
};

/** Which of `eventTypes` the org listens for — one endpoint fetch. */
export const isSubscribedToEvents = async ({
	org,
	env,
	eventTypes,
}: {
	org: Organization;
	env: AppEnv;
	eventTypes: string[];
}): Promise<string[]> => {
	const endpoints = (await listSvixEndpoints({ org, env })) ?? [];
	return eventTypes.filter((eventType) =>
		endpoints.some((endpoint) =>
			endpointReceivesEvent({ endpoint, eventType }),
		),
	);
};

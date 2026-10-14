import type { AppEnv, Organization } from "@autumn/shared";
import {
	endpointsSubscribeToEvent,
	filterEventTypesSubscribed,
} from "@autumn/svix";
import { listSvixEndpoints } from "../operations/listSvixEndpoints.js";

export { endpointReceivesEvent } from "@autumn/svix";

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
	return endpointsSubscribeToEvent({ endpoints, eventType });
};

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
	return filterEventTypesSubscribed({ endpoints, eventTypes });
};

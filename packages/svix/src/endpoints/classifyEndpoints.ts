/** What the classifiers read; the SDK's own endpoint rows leave `filterTypes` unset or null when nothing is filtered. */
export type EndpointFilter = { filterTypes?: string[] | null };

/** An endpoint with no filter types receives every event. */
export const endpointReceivesEvent = ({
	endpoint,
	eventType,
}: {
	endpoint: EndpointFilter;
	eventType: string;
}): boolean => {
	const filterTypes = endpoint.filterTypes ?? [];
	return filterTypes.length === 0 || filterTypes.includes(eventType);
};

/** Whether any of the app's endpoints listens for `eventType`. */
export const endpointsSubscribeToEvent = ({
	endpoints,
	eventType,
}: {
	endpoints: EndpointFilter[];
	eventType: string;
}): boolean =>
	endpoints.some((endpoint) => endpointReceivesEvent({ endpoint, eventType }));

/** Which of `eventTypes` the app's endpoints listen for. */
export const filterEventTypesSubscribed = ({
	endpoints,
	eventTypes,
}: {
	endpoints: EndpointFilter[];
	eventTypes: string[];
}): string[] =>
	eventTypes.filter((eventType) =>
		endpointsSubscribeToEvent({ endpoints, eventType }),
	);

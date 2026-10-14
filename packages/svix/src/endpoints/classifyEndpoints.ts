export type EndpointFilter = { filterTypes?: string[] | null };

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

export const endpointsSubscribeToEvent = ({
	endpoints,
	eventType,
}: {
	endpoints: EndpointFilter[];
	eventType: string;
}): boolean =>
	endpoints.some((endpoint) => endpointReceivesEvent({ endpoint, eventType }));

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

import {
	apiRequestCatalog,
	apiRequestEventProperties,
} from "../src/apiRequests/apiRequestCatalog";

const ONE_REQUEST = 1;

export const apiRequestsRateCard = [
	{
		meteredFeatureId: "api_call",
		creditCost: ONE_REQUEST,
		dimensions: Object.fromEntries(
			apiRequestCatalog.map((endpoint) => [
				endpoint.id,
				{
					match: { [apiRequestEventProperties.endpointId]: endpoint.id },
					creditCost: ONE_REQUEST,
				},
			]),
		),
	},
];

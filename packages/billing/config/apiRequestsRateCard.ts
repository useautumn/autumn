import {
	apiRequestCatalog,
	apiRequestEventProperties,
} from "../src/apiRequests/apiRequestCatalog";

const ONE_REQUEST = 1;

/** One dimension per catalog endpoint, each costing one request. Deals override this per plan item. */
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

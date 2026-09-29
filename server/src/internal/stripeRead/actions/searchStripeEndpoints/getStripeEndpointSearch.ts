import { createStripeEndpointSearch } from "./createStripeEndpointSearch.js";

const STRIPE_OPENAPI_SPEC_URL =
	"https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json";

const fetchStripeOpenApiSpec = async () => {
	const response = await fetch(STRIPE_OPENAPI_SPEC_URL);
	if (!response.ok) {
		throw new Error(`Failed to fetch Stripe OpenAPI spec: ${response.status}`);
	}
	return response.json();
};

let stripeEndpointSearch:
	| ReturnType<typeof createStripeEndpointSearch>
	| undefined;

export const getStripeEndpointSearch = () => {
	stripeEndpointSearch ??= createStripeEndpointSearch({
		fetchSpec: fetchStripeOpenApiSpec,
	});
	return stripeEndpointSearch;
};

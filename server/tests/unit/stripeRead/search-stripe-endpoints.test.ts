import { describe, expect, mock, test } from "bun:test";
import { createStripeEndpointSearch } from "@/internal/stripeRead/actions/searchStripeEndpoints/createStripeEndpointSearch.js";

const op = ({
	summary,
	description = "",
	params = [],
}: {
	summary: string;
	description?: string;
	params?: string[];
}) => ({
	summary,
	description,
	parameters: params.map((name) => ({ name, in: "query" })),
});

const spec = {
	paths: {
		"/v1/subscriptions": {
			get: op({
				summary: "List subscriptions",
				description: "By default, returns a list of subscriptions",
				params: ["customer", "status", "limit"],
			}),
			post: op({ summary: "Create a subscription" }),
		},
		"/v1/subscriptions/{subscription_exposed_id}": {
			get: op({ summary: "Retrieve a subscription", params: ["expand"] }),
		},
		"/v1/invoices": { get: op({ summary: "List all invoices" }) },
		"/v1/accounts": {
			get: op({ summary: "List all connected subscription accounts" }),
		},
		"/v1/transfers": { get: op({ summary: "List all transfers" }) },
		"/v1/customers/{customer}": {
			delete: op({ summary: "Delete a subscription customer" }),
		},
	},
};

describe("createStripeEndpointSearch", () => {
	test("ranks GET endpoints by keyword match and omits writes and blacklisted paths", async () => {
		const fetchSpec = mock(async () => spec);
		const search = createStripeEndpointSearch({ fetchSpec });

		const { endpoints } = await search({ query: "subscription", limit: 10 });

		expect(endpoints.map((endpoint) => endpoint.path)).toEqual([
			"/v1/subscriptions",
			"/v1/subscriptions/{subscription_exposed_id}",
		]);
		expect(endpoints[0]).toEqual({
			path: "/v1/subscriptions",
			method: "GET",
			summary: "List subscriptions",
			query_params: ["customer", "status", "limit"],
		});
	});

	test("respects limit", async () => {
		const search = createStripeEndpointSearch({ fetchSpec: async () => spec });
		const { endpoints } = await search({ query: "list", limit: 1 });
		expect(endpoints).toHaveLength(1);
	});

	test("caches the spec until the TTL expires", async () => {
		let time = 0;
		const fetchSpec = mock(async () => spec);
		const search = createStripeEndpointSearch({
			fetchSpec,
			ttlMs: 1000,
			now: () => time,
		});

		await search({ query: "invoices" });
		await search({ query: "invoices" });
		expect(fetchSpec).toHaveBeenCalledTimes(1);

		time = 1001;
		await search({ query: "invoices" });
		expect(fetchSpec).toHaveBeenCalledTimes(2);
	});
});

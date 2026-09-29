import { expect, test } from "bun:test";
import { APPROVAL_GATED_TOOL_NAMES } from "../../../src/tools/approvalGated.js";
import { endpointByTool, schemaByTool } from "../../../src/tools/index.js";
import { stripe } from "../../../src/tools/stripe.js";

test("stripe tools route to the stripe RPC endpoints", () => {
	expect(endpointByTool.stripeRead).toBe("/v1/stripe.get");
	expect(endpointByTool.searchStripeEndpoints).toBe(
		"/v1/stripe.search_endpoints",
	);
});

test("stripeRead maps camelCase input to the snake_case request body", () => {
	expect(
		schemaByTool.stripeRead.parse({
			path: "/v1/subscriptions",
			params: { customer: "cus_1" },
			maxPages: 3,
		}),
	).toEqual({
		path: "/v1/subscriptions",
		params: { customer: "cus_1" },
		max_pages: 3,
	});
	expect(() =>
		schemaByTool.stripeRead.parse({ path: "/v1/customers", maxPages: 11 }),
	).toThrow();
});

test("stripe tools are read-only and never approval gated", () => {
	const operations = stripe.domain.operations;
	expect(operations.map((operation) => operation.id)).toEqual([
		"stripeRead",
		"searchStripeEndpoints",
	]);
	for (const operation of operations) {
		expect(operation.destructive).toBe(false);
		expect(APPROVAL_GATED_TOOL_NAMES).not.toContain(operation.id);
	}
	expect(stripe.domain.operations[0].description).toContain(
		"searchStripeEndpoints",
	);
});

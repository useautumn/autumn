import { expect, test } from "bun:test";
import {
	buildApiBody,
	buildApiRequest,
	findApiRoute,
} from "../src/actions/api/callApi";

test("api billing advance_test_clock sends millisecond timestamps", async () => {
	const route = findApiRoute({
		group: "billing",
		method: "advance_test_clock",
	});
	if (!route)
		throw new Error("advance_test_clock is missing from the public API");
	const body = await buildApiBody({
		route,
		fields: { customer_id: "customer_123", frozen_time: "1800000000123" },
	});
	expect(body).toEqual({
		customer_id: "customer_123",
		frozen_time: 1800000000123,
	});
	expect(route.path).toBe("/v1/billing.advance_test_clock");
	expect(
		route.fields.map(({ name, required }) => ({ name, required })),
	).toEqual([
		{ name: "customer_id", required: true },
		{ name: "frozen_time", required: true },
	]);
	const request = await buildApiRequest({
		route,
		body: JSON.stringify(body),
		secretKey: "test-api-key",
		baseUrl: "https://example.com",
	});
	expect(request.url).toBe("https://example.com/v1/billing.advance_test_clock");
	expect(JSON.parse(request.body)).toEqual(body);
});

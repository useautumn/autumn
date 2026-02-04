import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const testCase = "rate-limit-events";
const customerId = `test-${testCase}`;

// Events rate limit is 5 per second per customer
const EVENTS_RATE_LIMIT = 5;

/**
 * Test: Rate limit on events endpoints (list, aggregate, query)
 * The events rate limit is set to 5 requests per second per customer.
 */
test(`${chalk.yellowBright(testCase)}`, async () => {
	// Setup: create customer with a product that has messages
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const baseProduct = products.base({ id: "base", items: [messagesItem] });

	const { ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [baseProduct] }),
		],
		actions: [
			s.attach({ productId: baseProduct.id }),
			// Track some events so we have data to query
			s.track({ featureId: TestFeature.Messages, value: 10 }),
			s.track({ featureId: TestFeature.Messages, value: 20 }),
		],
	});

	// Wait for events to be processed
	await new Promise((resolve) => setTimeout(resolve, 1000));

	// Make raw fetch requests to events/list endpoint
	// We need to exceed the rate limit of 5 requests per second
	const makeEventsListRequest = async () => {
		const response = await fetch("http://localhost:8080/v1/events/list", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${ctx.orgSecretKey}`,
				"Content-Type": "application/json",
				"x-api-version": ApiVersion.V1_2,
			},
			body: JSON.stringify({
				customer_id: customerId,
			}),
		});
		return response;
	};

	// Fire off more requests than the rate limit allows (5 + a few more)
	const requestCount = EVENTS_RATE_LIMIT + 3;
	const responses = await Promise.all(
		Array.from({ length: requestCount }, () => makeEventsListRequest()),
	);

	// Count how many succeeded (200) and how many were rate limited (429)
	const successCount = responses.filter((r) => r.status === 200).length;
	const rateLimitedCount = responses.filter((r) => r.status === 429).length;

	console.log(
		`Requests: ${requestCount}, Successes: ${successCount}, Rate limited: ${rateLimitedCount}`,
	);

	// At least one should be rate limited since we exceeded the limit
	expect(rateLimitedCount).toBeGreaterThan(0);

	// The rate limited responses should have status 429
	const rateLimitedResponse = responses.find((r) => r.status === 429);
	expect(rateLimitedResponse?.status).toBe(429);

	// Verify the successful responses actually returned data
	const successfulResponse = responses.find((r) => r.status === 200);
	if (successfulResponse) {
		const data = await successfulResponse.json();
		expect(data).toBeDefined();
	}
});

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import AutumnError from "@/external/autumn/autumnCli.js";

const testCase = "rate-limit-events-query";
const customerId = `test-${testCase}`;

// Events rate limit is 5 per second per customer
const EVENTS_RATE_LIMIT = 5;

/**
 * Test: Rate limit on /query endpoint
 */
test(`${chalk.yellowBright(testCase)}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const baseProduct = products.base({ id: "base", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [baseProduct] }),
		],
		actions: [
			s.attach({ productId: baseProduct.id }),
			s.track({ featureId: TestFeature.Messages, value: 10 }),
			s.track({ featureId: TestFeature.Messages, value: 20 }),
		],
	});

	await new Promise((resolve) => setTimeout(resolve, 1000));

	const requestCount = EVENTS_RATE_LIMIT + 3;

	const results = await Promise.allSettled(
		Array.from({ length: requestCount }, () =>
			autumnV1.events.query({ customer_id: customerId }),
		),
	);

	const successCount = results.filter((r) => r.status === "fulfilled").length;
	const rateLimitedCount = results.filter(
		(r) =>
			r.status === "rejected" &&
			r.reason instanceof AutumnError &&
			r.reason.code === "rate_limit_exceeded",
	).length;

	console.log(
		`Requests: ${requestCount}, Successes: ${successCount}, Rate limited: ${rateLimitedCount}`,
	);

	expect(rateLimitedCount).toBeGreaterThan(0);

	const rateLimitedResult = results.find(
		(r) =>
			r.status === "rejected" &&
			r.reason instanceof AutumnError &&
			r.reason.code === "rate_limit_exceeded",
	);
	expect(rateLimitedResult).toBeDefined();
});

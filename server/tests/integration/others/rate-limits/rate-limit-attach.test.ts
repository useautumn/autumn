import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import AutumnError from "@/external/autumn/autumnCli.js";

const testCase = "rate-limit-attach";
const customerId = `test-${testCase}`;

// Attach rate limit is 5 per minute per customer
const ATTACH_RATE_LIMIT = 5;

/**
 * Test: Rate limit on /attach endpoint
 * Note: Attach rate limiting is bypassed in dev/test for the test org (see rateLimitMiddleware.ts)
 * This test is skipped because it cannot be tested in the test environment.
 */
test.skip(`${chalk.yellowBright(testCase)}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	// Create multiple add-on products so we can attach them
	const addon1 = products.base({
		id: "addon1",
		items: [messagesItem],
		isAddOn: true,
	});
	const addon2 = products.base({
		id: "addon2",
		items: [messagesItem],
		isAddOn: true,
	});
	const addon3 = products.base({
		id: "addon3",
		items: [messagesItem],
		isAddOn: true,
	});
	const addon4 = products.base({
		id: "addon4",
		items: [messagesItem],
		isAddOn: true,
	});
	const addon5 = products.base({
		id: "addon5",
		items: [messagesItem],
		isAddOn: true,
	});
	const addon6 = products.base({
		id: "addon6",
		items: [messagesItem],
		isAddOn: true,
	});
	const addon7 = products.base({
		id: "addon7",
		items: [messagesItem],
		isAddOn: true,
	});
	const addon8 = products.base({
		id: "addon8",
		items: [messagesItem],
		isAddOn: true,
	});
	const baseProduct = products.base({ id: "base", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({
				list: [
					baseProduct,
					addon1,
					addon2,
					addon3,
					addon4,
					addon5,
					addon6,
					addon7,
					addon8,
				],
			}),
		],
		actions: [s.attach({ productId: baseProduct.id })],
	});

	// Fire off more attach requests than the rate limit allows
	const addons = [
		addon1,
		addon2,
		addon3,
		addon4,
		addon5,
		addon6,
		addon7,
		addon8,
	];
	const requestCount = ATTACH_RATE_LIMIT + 3;

	const results = await Promise.allSettled(
		addons.slice(0, requestCount).map((addon) =>
			autumnV1.attach({
				customer_id: customerId,
				product_id: addon.id,
			}),
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

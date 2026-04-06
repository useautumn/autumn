import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import AutumnError from "@/external/autumn/autumnCli.js";

const HOT_PATH_REQUEST_COUNT = 12;

const expectNoRateLimitErrors = async ({
	requests,
}: {
	requests: Promise<unknown>[];
}) => {
	const results = await Promise.allSettled(requests);

	const rateLimitedCount = results.filter(
		(result) =>
			result.status === "rejected" &&
			result.reason instanceof AutumnError &&
			result.reason.code === "rate_limit_exceeded",
	).length;

	const failedResults = results.filter(
		(result) => result.status === "rejected",
	);

	expect(rateLimitedCount).toBe(0);
	expect(failedResults).toHaveLength(0);
	expect(results).toHaveLength(HOT_PATH_REQUEST_COUNT);
};

test.concurrent(`${chalk.yellowBright("rate-limit-hot-paths: track")}`, async () => {
	const customerId = "rate-limit-hot-track";
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const baseProduct = products.base({ id: "base", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [baseProduct] }),
		],
		actions: [s.attach({ productId: baseProduct.id })],
	});

	await expectNoRateLimitErrors({
		requests: Array.from({ length: HOT_PATH_REQUEST_COUNT }, () =>
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
			}),
		),
	});
});

test.concurrent(`${chalk.yellowBright("rate-limit-hot-paths: check")}`, async () => {
	const customerId = "rate-limit-hot-check";
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const baseProduct = products.base({ id: "base", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [baseProduct] }),
		],
		actions: [s.attach({ productId: baseProduct.id })],
	});

	await expectNoRateLimitErrors({
		requests: Array.from({ length: HOT_PATH_REQUEST_COUNT }, () =>
			autumnV1.check({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
			}),
		),
	});
});

test.concurrent(`${chalk.yellowBright("rate-limit-hot-paths: customer-get")}`, async () => {
	const customerId = "rate-limit-hot-customer-get";
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const baseProduct = products.base({ id: "base", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [baseProduct] }),
		],
		actions: [s.attach({ productId: baseProduct.id })],
	});

	await expectNoRateLimitErrors({
		requests: Array.from({ length: HOT_PATH_REQUEST_COUNT }, () =>
			autumnV1.customers.get(customerId),
		),
	});
});

test.concurrent(`${chalk.yellowBright("rate-limit-hot-paths: entity-get")}`, async () => {
	const customerId = "rate-limit-hot-entity-get";
	const entityId = "entity-hot-path";
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV1.entities.create(customerId, {
		id: entityId,
		name: "Hot Path Entity",
		feature_id: TestFeature.Users,
	});

	await expectNoRateLimitErrors({
		requests: Array.from({ length: HOT_PATH_REQUEST_COUNT }, () =>
			autumnV1.entities.get(customerId, entityId),
		),
	});
});

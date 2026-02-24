import { expect, test } from "bun:test";

import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// TRACK-EDGE-CASE1: Floating point precision with decimal tracking
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-edge-case1: floating point precision with decimal tracking")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const creditsItem = items.monthlyCredits({ includedUsage: 500 });

	const freeProd = products.base({
		id: "free",
		items: [messagesItem, creditsItem],
	});

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "track-edge-case1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Credits].balance).toEqual(500);

	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: 0.1,
	});

	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: 0.2,
	});

	const checkRes = await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		required_balance: 10.3,
		send_event: true,
	});

	expect(checkRes.allowed).toBe(true);
	expect(checkRes.balance).toBeDefined();
});

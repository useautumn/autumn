import { expect, test } from "bun:test";

import type { CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// Check + send_event on a feature linked to a credit system should:
//  - keep `balance` populated with the tracked feature (backwards compat)
//  - populate `balances` with both the feature and the credit system

test.concurrent(`${chalk.yellowBright("check-send-event-credit-system: returns balance + balances for linked credit system")}`, async () => {
	const action1Item = items.free({
		featureId: TestFeature.Action1,
		includedUsage: 100,
	});
	const creditsItem = items.free({
		featureId: TestFeature.Credits,
		includedUsage: 200,
	});
	const freeProd = products.base({
		id: "free",
		items: [action1Item, creditsItem],
	});

	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "check-send-event-credit-system",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const checkRes = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		required_balance: 5,
		send_event: true,
	});

	expect(checkRes.allowed).toBe(true);
	// Backwards-compat single balance
	expect(checkRes.balance).not.toBeNull();
	expect(checkRes.balance?.feature_id).toBe(TestFeature.Action1);
	// New balances field exposes both the feature and its credit system
	expect(checkRes.balances).toBeDefined();
	expect(Object.keys(checkRes.balances ?? {}).sort()).toEqual(
		[TestFeature.Action1, TestFeature.Credits].sort(),
	);
	expect(checkRes.balances?.[TestFeature.Action1]).not.toBeNull();
	expect(checkRes.balances?.[TestFeature.Credits]).not.toBeNull();
});

test.concurrent(`${chalk.yellowBright("check-send-event-no-credit-system: returns single balance and no balances field")}`, async () => {
	const messagesItem = items.free({
		featureId: TestFeature.Messages,
		includedUsage: 100,
	});
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "check-send-event-no-credit-system",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const checkRes = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
		send_event: true,
	});

	expect(checkRes.allowed).toBe(true);
	expect(checkRes.balance).not.toBeNull();
	expect(checkRes.balance?.feature_id).toBe(TestFeature.Messages);
	expect(checkRes.balances).toBeUndefined();
});

import { expect, test } from "bun:test";

import type { TrackResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Scenario A: track feature_id linked to 2 credit systems
// Action1 → Credits, and we add an extra credit system entry that
// references Action1 too. v2Features only ships Credits referencing
// Action1; we use Action1 + Credits (1 main + 1 credit system) = 2
// balances. To get 3 balances we'd need an extra credit system —
// instead we cover the multi-credit-system case via Scenario B.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-all-balances-A: track feature_id linked to credit system returns both balances")}`, async () => {
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
		customerId: "track-all-balances-a",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const trackRes: TrackResponseV3 = await autumnV2_2.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: 10,
	});

	// `balance` keeps backwards-compat single-feature heuristic
	expect(trackRes.balance).not.toBeNull();
	expect(trackRes.balance?.feature_id).toBe(TestFeature.Action1);
	// `balances` exposes the feature plus its linked credit system
	expect(trackRes.balances).toBeDefined();
	expect(Object.keys(trackRes.balances ?? {}).sort()).toEqual(
		[TestFeature.Action1, TestFeature.Credits].sort(),
	);
	expect(trackRes.balances?.[TestFeature.Action1]).not.toBeNull();
	expect(trackRes.balances?.[TestFeature.Credits]).not.toBeNull();
});

// ═══════════════════════════════════════════════════════════════════
// Scenario B: event_name → 2 features, each with 1 credit system
// "action-event" matches Action1 (→ Credits) and Action3 (→ Credits2).
// Expect 4 balances: Action1, Action3, Credits, Credits2.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-all-balances-B: event_name across two features returns four balances")}`, async () => {
	const action1Item = items.free({
		featureId: TestFeature.Action1,
		includedUsage: 80,
	});
	const creditsItem = items.free({
		featureId: TestFeature.Credits,
		includedUsage: 150,
	});
	const action3Item = items.free({
		featureId: TestFeature.Action3,
		includedUsage: 60,
	});
	const credits2Item = items.free({
		featureId: TestFeature.Credits2,
		includedUsage: 100,
	});
	const freeProd = products.base({
		id: "free",
		items: [action1Item, creditsItem, action3Item, credits2Item],
	});

	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "track-all-balances-b",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const trackRes: TrackResponseV3 = await autumnV2_2.track({
		customer_id: customerId,
		event_name: "action-event",
		value: 5,
	});

	expect(trackRes.balance).toBeNull();
	expect(trackRes.balances).toBeDefined();
	expect(Object.keys(trackRes.balances ?? {}).sort()).toEqual(
		[
			TestFeature.Action1,
			TestFeature.Action3,
			TestFeature.Credits,
			TestFeature.Credits2,
		].sort(),
	);
	for (const fid of [
		TestFeature.Action1,
		TestFeature.Action3,
		TestFeature.Credits,
		TestFeature.Credits2,
	]) {
		expect(trackRes.balances?.[fid]).not.toBeNull();
	}
});

// ═══════════════════════════════════════════════════════════════════
// Scenario C: feature_id with no linked credit systems
// Messages has no credit system referencing it. Expect single balance.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-all-balances-C: feature_id with no credit systems returns single balance")}`, async () => {
	const messagesItem = items.free({
		featureId: TestFeature.Messages,
		includedUsage: 100,
	});
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "track-all-balances-c",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const trackRes: TrackResponseV3 = await autumnV2_2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 7,
	});

	expect(trackRes.balance).not.toBeNull();
	expect(trackRes.balance?.feature_id).toBe(TestFeature.Messages);
	expect(trackRes.balances).toBeUndefined();
});

// ═══════════════════════════════════════════════════════════════════
// Scenario D: tracking a credit system directly does NOT return its
// metered features (no walking backwards).
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-all-balances-D: tracking credit system directly returns only that balance")}`, async () => {
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
		customerId: "track-all-balances-d",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const trackRes: TrackResponseV3 = await autumnV2_2.track({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		value: 5,
	});

	expect(trackRes.balance).not.toBeNull();
	expect(trackRes.balance?.feature_id).toBe(TestFeature.Credits);
	expect(trackRes.balances).toBeUndefined();
});

// ═══════════════════════════════════════════════════════════════════
// Scenario E: relevant credit system feature exists in the org but
// the customer has no entitlement to it. Response key is present
// with value null.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-all-balances-E: missing entitlement on related feature returns null entry")}`, async () => {
	const action1Item = items.free({
		featureId: TestFeature.Action1,
		includedUsage: 100,
	});
	const freeProd = products.base({
		id: "free",
		items: [action1Item],
	});

	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "track-all-balances-e",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const trackRes: TrackResponseV3 = await autumnV2_2.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: 5,
	});

	// `balance` falls back to Action1 (Credits is not entitled)
	expect(trackRes.balance).not.toBeNull();
	expect(trackRes.balance?.feature_id).toBe(TestFeature.Action1);
	// `balances` includes the null entry for the missing entitlement
	expect(trackRes.balances).toBeDefined();
	expect(Object.keys(trackRes.balances ?? {}).sort()).toEqual(
		[TestFeature.Action1, TestFeature.Credits].sort(),
	);
	expect(trackRes.balances?.[TestFeature.Action1]).not.toBeNull();
	expect(trackRes.balances?.[TestFeature.Credits]).toBeNull();
});

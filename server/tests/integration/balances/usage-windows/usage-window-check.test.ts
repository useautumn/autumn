/**
 * TDD tests for usage-limit awareness in check / lock / finalize.
 *
 * Contract under test:
 *   Pure check:
 *     - required_balance > window headroom (balance sufficient) -> allowed: false
 *     - required_balance <= headroom -> allowed: true; balance never deducted
 *     - metered cap on a credit-system member feature converts via credit_cost
 *
 * Lock / finalize contracts live in usage-window-lock.test.ts.
 */

import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerBalance,
	setCustomerUsageLimit,
} from "../utils/usage-limit-utils/customerUsageLimitUtils.js";

// initScenario only exposes clients up to V2_2; build the latest-version client
// directly (same pattern as the v2.2-vs-v2.3 parity tests).
const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

// ── Contract: pure check is gated by window headroom ──────────────
test.concurrent(
	`${chalk.yellowBright("usage-window-check1: pure check respects window headroom (metered cap)")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-check-pure",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-check-pure-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		// Headroom is 2: a check within it is allowed...
		const within = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 2,
		});
		expect(within.allowed).toBe(true);

		// ...and a check beyond it is rejected, despite 97 balance remaining.
		const beyond = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 3,
		});
		expect(beyond.allowed).toBe(false);

		// Pure checks never consume anything.
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 97,
			usage: 3,
		});
	},
);

// ── Contract: pure check converts metered caps via credit_cost ────
test.concurrent(
	`${chalk.yellowBright("usage-window-check2: pure check converts a metered cap on a credit-funded feature")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-check-convert",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-check-convert-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			limit: 5,
		});

		// 3 of 5 action1 units used (= 0.6 credits).
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 3,
		});

		const within = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 2,
		});
		expect(within.allowed).toBe(true);

		// 3 more units exceed the 5-unit cap while ~99.4 credits remain.
		const beyond = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 3,
		});
		expect(beyond.allowed).toBe(false);
	},
);

// ── Contract: a cap on another feature never gates this one ───────
test.concurrent(
	`${chalk.yellowBright("usage-window-check6: an exhausted action1 cap does not gate a credits check")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-check-scope",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-check-scope-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			limit: 5,
		});

		// Exhaust the action1 cap.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});

		// Sanity: the cap binds its own feature...
		const action1Check = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 1,
		});
		expect(action1Check.allowed).toBe(false);

		// ...but a direct credits check sails through on the 99 remaining credits.
		const creditsCheck = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			required_balance: 50,
		});
		expect(creditsCheck.allowed).toBe(true);
	},
);

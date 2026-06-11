/**
 * TDD tests for usage limits on the LOCK / FINALIZE flow.
 *
 * Contract under test:
 *   - a lock is gated by window headroom and counts at lock time
 *   - finalize at the lock value does not double count
 *   - finalize below the lock decrements the counter (freed headroom reusable)
 *   - finalize ABOVE the lock is capped at the window limit: only the
 *     remaining headroom of the extra delta applies, and it is counted
 */

import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerBalance,
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../utils/usage-limit-utils/customerUsageLimitUtils.js";

// initScenario only exposes clients up to V2_2; build the latest-version client
// directly (same pattern as the v2.2-vs-v2.3 parity tests).
const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

// ── Contract: locks are gated by headroom and count at lock time ──
test.concurrent(
	`${chalk.yellowBright("usage-window-lock1: a lock consumes window headroom; an over-cap lock is rejected")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-check-lock",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-check-lock-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});
		await deleteLock({ ctx, lockId: `${customerId}-a` });
		await deleteLock({ ctx, lockId: `${customerId}-b` });

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		// Lock 4 of the 5-unit cap: granted, and counted at lock time.
		const granted = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 4,
			lock: { enabled: true, lock_id: `${customerId}-a` },
		});
		expect(granted.allowed).toBe(true);
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 96,
			usage: 4,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 4,
			limit: 5,
		});

		// A second lock of 2 exceeds the remaining headroom of 1: rejected, and
		// neither the balance nor the counter moves.
		const rejected = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 2,
			lock: { enabled: true, lock_id: `${customerId}-b` },
		});
		expect(rejected.allowed).toBe(false);
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 96,
			usage: 4,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 4,
			limit: 5,
		});
	},
);

// ── Contract: finalize at lock value does not double count ────────
test.concurrent(
	`${chalk.yellowBright("usage-window-lock2: finalize at the lock value leaves the counter unchanged")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-check-confirm",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-check-confirm-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});
		await deleteLock({ ctx, lockId: customerId });

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 3,
			lock: { enabled: true, lock_id: customerId },
		});

		await autumnV2_3.balances.finalize({
			lock_id: customerId,
			action: "confirm",
		});

		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 97,
			usage: 3,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
		});
	},
);

// ── Contract: finalize below the lock decrements the counter ──────
test.concurrent(
	`${chalk.yellowBright("usage-window-lock3: finalize below the lock value frees window headroom")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-check-unwind",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-check-unwind-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});
		await deleteLock({ ctx, lockId: customerId });

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		// Lock 4, finalize at 1: the unwind must give 3 units of headroom back.
		await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 4,
			lock: { enabled: true, lock_id: customerId },
		});
		await autumnV2_3.balances.finalize({
			lock_id: customerId,
			action: "confirm",
			override_value: 1,
		});

		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 99,
			usage: 1,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 1,
			limit: 5,
		});

		// The freed headroom (4) is consumable: a track of 5 clamps to 4.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 95,
			usage: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});
	},
);

// ── Contract: finalize above the lock is capped at the window limit ──
test.concurrent(
	`${chalk.yellowBright("usage-window-lock4: finalize above the lock value is capped at the window limit")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-lock-overfinal",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-lock-overfinal-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});
		await deleteLock({ ctx, lockId: customerId });

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		// Lock 3 of the 5-unit cap (counter 3, headroom 2)...
		const granted = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 3,
			lock: { enabled: true, lock_id: customerId },
		});
		expect(granted.allowed).toBe(true);

		// ...then finalize at 6: the extra 3 must clamp to the remaining headroom
		// of 2, landing the final usage exactly at the cap.
		await autumnV2_3.balances.finalize({
			lock_id: customerId,
			action: "confirm",
			override_value: 6,
		});

		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 95,
			usage: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});

		// The cap is exhausted: a further track fully clamps.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 95,
			usage: 5,
		});
	},
);

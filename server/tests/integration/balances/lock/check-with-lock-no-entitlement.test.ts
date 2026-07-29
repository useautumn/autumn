import { test } from "bun:test";
import { expect } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Edge case: customer has NO entitlement for a feature, but calls check with lock.enabled=true
 *
 * Expected behavior: check should return allowed: false
 * Bug (before fix): check returned allowed: true because the Lua script returned success
 * with empty customer_entitlement_deductions
 */

test.concurrent(
	`${chalk.yellowBright("lock-no-entitlement: check with lock on feature customer doesn't have returns allowed: false")}`,
	async () => {
		const customerId = "lock-no-entitlement-test";
		const lockKey = `${customerId}-lock`;

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				// Customer has no products attached, so no entitlements
			],
			actions: [],
		});

		// Check with lock on a feature the customer has no entitlement for
		const checkResponse = await autumnV2_1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 10,
			lock: { enabled: true, lock_id: lockKey },
		});

		// Should return allowed: false since customer has no entitlement
		expect(checkResponse.allowed).toBe(false);
		expect(checkResponse.balance).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("lock-no-entitlement: check with lock and required_balance=0 on feature customer doesn't have returns allowed: true")}`,
	async () => {
		const customerId = "lock-no-entitlement-zero-test";
		const lockKey = `${customerId}-lock`;

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				// Customer has no products attached, so no entitlements
			],
			actions: [],
		});

		// Check with lock but required_balance=0 should be allowed even without entitlement
		const checkResponse = await autumnV2_1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 0,
			lock: { enabled: true, lock_id: lockKey },
		});

		// Should return allowed: true since we're not requesting any balance
		expect(checkResponse.allowed).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("lock-no-entitlement: send_event=true without lock on feature customer doesn't have still works")}`,
	async () => {
		const customerId = "no-entitlement-send-event-test";

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				// Customer has no products attached, so no entitlements
			],
			actions: [],
		});

		// Check with send_event=true (but no lock) should work as before (silent no-op)
		const checkResponse = await autumnV2_1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 10,
			send_event: true,
		});

		// Should return allowed: false due to insufficient balance
		expect(checkResponse.allowed).toBe(false);
	},
);

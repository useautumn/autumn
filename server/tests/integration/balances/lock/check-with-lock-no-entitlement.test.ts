import { test } from "bun:test";
import { expect } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("lock-no-entitlement: check with lock on feature customer doesn't have returns allowed: false")}`,
	async () => {
		const customerId = "lock-no-entitlement-test";
		const lockKey = `${customerId}-lock`;

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const checkResponse = await autumnV2_1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 10,
			lock: { enabled: true, lock_id: lockKey },
		});

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
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const checkResponse = await autumnV2_1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 0,
			lock: { enabled: true, lock_id: lockKey },
		});

		expect(checkResponse.allowed).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("lock-no-entitlement: send_event=true without lock on feature customer doesn't have still works")}`,
	async () => {
		const customerId = "no-entitlement-send-event-test";

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const checkResponse = await autumnV2_1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 10,
			send_event: true,
		});

		expect(checkResponse.allowed).toBe(false);
	},
);

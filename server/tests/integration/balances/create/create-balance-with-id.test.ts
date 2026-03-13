import { expect, test } from "bun:test";
import type { CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// BALANCE-ID-CREATE-1: balance_id is stored and returned via breakdown[n].id
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("balance-id-create-1: balance_id is stored and returned via breakdown.id")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "balance-id-create-1",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 100,
		balance_id: "my-balance",
	});

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(check.balance?.breakdown).toHaveLength(1);
	expect(check.balance?.breakdown?.[0].id).toBe("my-balance");
	expect(check.balance?.breakdown?.[0].current_balance).toBe(100);

	// Verify DB sync
	const checkFromDb = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(checkFromDb.balance?.breakdown?.[0].id).toBe("my-balance");
});

// ═══════════════════════════════════════════════════════════════════
// BALANCE-ID-CREATE-2: Duplicate balance_id for same customer is rejected
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("balance-id-create-2: duplicate balance_id is rejected with 409")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "balance-id-create-2",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 100,
		balance_id: "dup-balance",
	});

	await expectAutumnError({
		func: async () => {
			await autumnV2.balances.create({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				included_grant: 50,
				balance_id: "dup-balance",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════
// BALANCE-ID-CREATE-3: Same balance_id on different customers is allowed
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("balance-id-create-3: same balance_id on different customers is allowed")}`, async () => {
	const otherCustomerId = "balance-id-create-3b";

	const { customerId, autumnV2 } = await initScenario({
		customerId: "balance-id-create-3a",
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([{ id: otherCustomerId }]),
		],
		actions: [],
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 100,
		balance_id: "shared-id",
	});

	// Should not throw — different customer
	await autumnV2.balances.create({
		customer_id: otherCustomerId,
		feature_id: TestFeature.Messages,
		included_grant: 200,
		balance_id: "shared-id",
	});

	const [check1, check2] = await Promise.all([
		autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		}),
		autumnV2.check<CheckResponseV2>({
			customer_id: otherCustomerId,
			feature_id: TestFeature.Messages,
		}),
	]);

	expect(check1.balance?.breakdown?.[0].id).toBe("shared-id");
	expect(check2.balance?.breakdown?.[0].id).toBe("shared-id");
});

// ═══════════════════════════════════════════════════════════════════
// BALANCE-ID-CREATE-4: Multiple loose balances for same feature, each with own balance_id
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("balance-id-create-4: multiple balances for same feature each have their own breakdown id")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "balance-id-create-4",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 100,
		balance_id: "balance-a",
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 200,
		balance_id: "balance-b",
	});

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(check.balance?.breakdown).toHaveLength(2);

	const ids = check.balance?.breakdown?.map((b) => b.id) ?? [];
	expect(ids).toContain("balance-a");
	expect(ids).toContain("balance-b");

	// Aggregate current_balance = 300
	expect(check.balance?.current_balance).toBe(300);
});

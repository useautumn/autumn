import { expect, test } from "bun:test";
import {
	customerEntitlements,
	type CheckResponseV2,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════════
// DELETE-BALANCE-1: Basic delete of a loose balance removes it from
// check response (cache + DB).
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("delete-balance-1: basic delete of loose balance removes it")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "del-bal-1",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 100,
		balance_id: "del-bal-1-balance",
	});

	// Confirm it exists
	const before = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(before.balance?.breakdown).toHaveLength(1);

	// Delete it
	await autumnV2.balances.delete({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		balance_id: "del-bal-1-balance",
	});

	// Cache should be empty
	const afterCache = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(afterCache.balance?.breakdown ?? []).toHaveLength(0);

	// DB should also be empty
	const afterDb = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(afterDb.balance?.breakdown ?? []).toHaveLength(0);
});

// ═══════════════════════════════════════════════════════════════════
// DELETE-BALANCE-2: Delete by balance_id targets only the correct
// balance when the customer has multiple balances for the same feature.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("delete-balance-2: balance_id targets only the correct balance")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "del-bal-2",
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

	// Delete only balance-a
	await autumnV2.balances.delete({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		balance_id: "balance-a",
	});

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Only balance-b remains
	expect(check.balance?.breakdown).toHaveLength(1);
	expect(check.balance?.breakdown?.[0].id).toBe("balance-b");
	expect(check.balance?.current_balance).toBe(200);

	// Verify DB sync
	const checkDb = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(checkDb.balance?.breakdown).toHaveLength(1);
	expect(checkDb.balance?.breakdown?.[0].id).toBe("balance-b");
});

// ═══════════════════════════════════════════════════════════════════
// DELETE-BALANCE-2A: deleting a partially-used balance without
// recalculate_balances leaves other balances unchanged.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("delete-balance-2a: default delete does not deduct deleted remaining amount")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "del-bal-2a",
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

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		remaining: 60,
		balance_id: "balance-a",
	});

	await autumnV2.balances.delete({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		balance_id: "balance-a",
	});

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(check.balance?.breakdown).toHaveLength(1);
	expect(check.balance?.breakdown?.[0].id).toBe("balance-b");
	expect(check.balance?.current_balance).toBe(200);
	expect(check.balance?.granted_balance).toBe(200);
	expect(check.balance?.usage).toBe(0);
	expect(check.balance?.breakdown?.[0].current_balance).toBe(200);
	expect(check.balance?.breakdown?.[0].granted_balance).toBe(200);
	expect(check.balance?.breakdown?.[0].usage).toBe(0);

	const checkDb = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(checkDb.balance?.breakdown).toHaveLength(1);
	expect(checkDb.balance?.breakdown?.[0].id).toBe("balance-b");
	expect(checkDb.balance?.current_balance).toBe(200);
	expect(checkDb.balance?.granted_balance).toBe(200);
	expect(checkDb.balance?.usage).toBe(0);
	expect(checkDb.balance?.breakdown?.[0].current_balance).toBe(200);
	expect(checkDb.balance?.breakdown?.[0].granted_balance).toBe(200);
	expect(checkDb.balance?.breakdown?.[0].usage).toBe(0);
});

// ═══════════════════════════════════════════════════════════════════
// DELETE-BALANCE-2B: recalculate_balances deducts the deleted balance's
// used amount from the surviving balances for the feature.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("delete-balance-2b: recalculate_balances deducts deleted usage amount")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "del-bal-2b",
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

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		remaining: 60,
		balance_id: "balance-a",
	});

	await autumnV2.balances.delete({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		balance_id: "balance-a",
		recalculate_balances: true,
	});

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(check.balance?.breakdown).toHaveLength(1);
	expect(check.balance?.breakdown?.[0].id).toBe("balance-b");
	expect(check.balance?.current_balance).toBe(160);
	expect(check.balance?.granted_balance).toBe(200);
	expect(check.balance?.usage).toBe(40);
	expect(check.balance?.breakdown?.[0].current_balance).toBe(160);
	expect(check.balance?.breakdown?.[0].granted_balance).toBe(200);
	expect(check.balance?.breakdown?.[0].usage).toBe(40);

	const checkDb = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(checkDb.balance?.breakdown).toHaveLength(1);
	expect(checkDb.balance?.breakdown?.[0].id).toBe("balance-b");
	expect(checkDb.balance?.current_balance).toBe(160);
	expect(checkDb.balance?.granted_balance).toBe(200);
	expect(checkDb.balance?.usage).toBe(40);
	expect(checkDb.balance?.breakdown?.[0].current_balance).toBe(160);
	expect(checkDb.balance?.breakdown?.[0].granted_balance).toBe(200);
	expect(checkDb.balance?.breakdown?.[0].usage).toBe(40);
});

// ═══════════════════════════════════════════════════════════════════
// DELETE-BALANCE-2C: recalculate_balances requires feature_id so we do
// not delete across multiple features and recalculate the wrong one.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("delete-balance-2c: recalculate_balances requires feature_id")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "del-bal-2c",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 100,
		balance_id: "balance-a",
	});

	await expectAutumnError({
		errMessage: "feature_id is required when recalculate_balances is true",
		func: async () => {
			await autumnV2.balances.delete({
				customer_id: customerId,
				balance_id: "balance-a",
				recalculate_balances: true,
			});
		},
	});

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check.balance?.breakdown).toHaveLength(1);
	expect(check.balance?.breakdown?.[0].id).toBe("balance-a");
	expect(check.balance?.current_balance).toBe(100);
});

// ═══════════════════════════════════════════════════════════════════
// DELETE-BALANCE-2D: overused deleted balances should still transfer
// their usage to surviving balances.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("delete-balance-2d: recalculate_balances deducts deleted overage usage")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "del-bal-2d",
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

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		usage: 130,
		balance_id: "balance-a",
	});

	await autumnV2.balances.delete({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		balance_id: "balance-a",
		recalculate_balances: true,
	});

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check.balance?.breakdown).toHaveLength(1);
	expect(check.balance?.breakdown?.[0].id).toBe("balance-b");
	expect(check.balance?.current_balance).toBe(70);
	expect(check.balance?.granted_balance).toBe(200);
	expect(check.balance?.usage).toBe(130);

	const checkDb = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(checkDb.balance?.breakdown).toHaveLength(1);
	expect(checkDb.balance?.breakdown?.[0].id).toBe("balance-b");
	expect(checkDb.balance?.current_balance).toBe(70);
	expect(checkDb.balance?.granted_balance).toBe(200);
	expect(checkDb.balance?.usage).toBe(130);
});

// ═══════════════════════════════════════════════════════════════════
// DELETE-BALANCE-2E: if there are no surviving balances to receive the
// deleted balance's usage, recalculate_balances converts the balance to
// overage instead of dropping the usage.
//
// Contract under test:
// - No new fields/endpoints.
// - Deleting the only partially-used balance with recalculate_balances=true
//   preserves the deleted usage as overage: grant 0, balance -usage.
// - The converted overage is visible from cache and skip_cache=true.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("delete-balance-2e: recalculate_balances converts only balance to overage")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "del-bal-2e",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 100,
		balance_id: "balance-a",
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		remaining: 60,
		balance_id: "balance-a",
	});

	await autumnV2.balances.delete({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		balance_id: "balance-a",
		recalculate_balances: true,
	});

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check.balance?.breakdown).toHaveLength(1);
	expect(check.balance?.breakdown?.[0].id).toBe("balance-a");
	expect(check.balance?.current_balance).toBe(-40);
	expect(check.balance?.granted_balance).toBe(0);
	expect(check.balance?.usage).toBe(40);

	const checkDb = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(checkDb.balance?.breakdown).toHaveLength(1);
	expect(checkDb.balance?.breakdown?.[0].id).toBe("balance-a");
	expect(checkDb.balance?.current_balance).toBe(-40);
	expect(checkDb.balance?.granted_balance).toBe(0);
	expect(checkDb.balance?.usage).toBe(40);
});

test.concurrent(`${chalk.yellowBright("delete-balance-2f: converted overage balance does not reset")}`, async () => {
	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "del-bal-2f",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 100,
		balance_id: "del-bal-2f-balance",
		reset: { interval: ResetInterval.Month },
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		remaining: 60,
		balance_id: "del-bal-2f-balance",
	});

	await autumnV2.balances.delete({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		balance_id: "del-bal-2f-balance",
		recalculate_balances: true,
	});

	const rows = await ctx.db
		.select({
			next_reset_at: customerEntitlements.next_reset_at,
			reset_cycle_anchor: customerEntitlements.reset_cycle_anchor,
		})
		.from(customerEntitlements)
		.where(eq(customerEntitlements.external_id, "del-bal-2f-balance"))
		.limit(1);

	expect(rows[0]?.next_reset_at).toBeNull();
	expect(rows[0]?.reset_cycle_anchor).toBeNull();

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(check.balance?.current_balance).toBe(-40);
	expect(check.balance?.granted_balance).toBe(0);
	expect(check.balance?.usage).toBe(40);
});

test.concurrent(`${chalk.yellowBright("delete-balance-2g: recalculate_balances converts entity balance to overage")}`, async () => {
	const messagesItem = items.monthlyMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const free = products.base({
		id: "del-bal-2g-free",
		items: [messagesItem],
	});

	const { customerId, autumnV2, entities } = await initScenario({
		customerId: "del-bal-2g",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [free] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: free.id })],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		remaining: 60,
	});

	await autumnV2.balances.delete({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		recalculate_balances: true,
	});

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(check.balance?.current_balance).toBe(-40);
	expect(check.balance?.granted_balance).toBe(0);
	expect(check.balance?.usage).toBe(40);
});

test.concurrent(`${chalk.yellowBright("delete-balance-2h: recalculate_balances converts multiple balances to one overage")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "del-bal-2h",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 100,
		balance_id: "del-bal-2h-a",
	});
	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 200,
		balance_id: "del-bal-2h-b",
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		balance_id: "del-bal-2h-a",
		remaining: 60,
	});
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		balance_id: "del-bal-2h-b",
		remaining: 170,
	});

	await autumnV2.balances.delete({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		recalculate_balances: true,
	});

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(check.balance?.breakdown).toHaveLength(1);
	expect(check.balance?.current_balance).toBe(-70);
	expect(check.balance?.granted_balance).toBe(0);
	expect(check.balance?.usage).toBe(70);
});

test.concurrent(`${chalk.yellowBright("delete-balance-2i: recalculate_balances converts multiple entity balances to overage")}`, async () => {
	const freeA = products.base({
		id: "del-bal-2i-free-a",
		items: [
			items.monthlyMessages({
				includedUsage: 100,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});
	const freeB = products.base({
		id: "del-bal-2i-free-b",
		items: [
			items.monthlyMessages({
				includedUsage: 100,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

	const { customerId, autumnV2, entities } = await initScenario({
		customerId: "del-bal-2i",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeA, freeB] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: freeA.id }),
			s.attach({ productId: freeB.id }),
		],
	});

	await autumnV2.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 130,
	});

	await autumnV2.balances.delete({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		recalculate_balances: true,
	});

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(check.balance?.current_balance).toBe(-130);
	expect(check.balance?.granted_balance).toBe(0);
	expect(check.balance?.usage).toBe(130);
});

// ═══════════════════════════════════════════════════════════════════
// DELETE-BALANCE-3: Cannot delete a paid balance (one attached to a
// paid product with a price). Should return an error.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("delete-balance-3: cannot delete a paid balance")}`, async () => {
	const messagesItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "del-bal-3",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV2.balances.delete({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════
// DELETE-BALANCE-4: Balance not found returns an error.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("delete-balance-4: balance not found returns error")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "del-bal-4",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV2.balances.delete({
				customer_id: customerId,
				balance_id: "nonexistent-balance",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════
// DELETE-BALANCE-5: After deleting a free-product balance, the feature
// balance is gone from both cache and DB.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("delete-balance-5: deleting free product balance clears feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "del-bal-5",
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.attach({ productId: free.id })],
	});

	// Delete the balance
	await autumnV2.balances.delete({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Feature balance is gone from cache
	const afterCache = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(afterCache.balance?.breakdown ?? []).toHaveLength(0);

	// Feature balance is gone from DB
	const afterDb = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(afterDb.balance?.breakdown ?? []).toHaveLength(0);
});

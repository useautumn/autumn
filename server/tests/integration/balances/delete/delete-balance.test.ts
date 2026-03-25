import { expect, test } from "bun:test";
import { type CheckResponseV2, customerEntitlements } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";

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
// current remaining amount from the surviving balances for the feature.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("delete-balance-2b: recalculate_balances deducts deleted remaining amount")}`, async () => {
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
	expect(check.balance?.current_balance).toBe(140);
	expect(check.balance?.granted_balance).toBe(200);
	expect(check.balance?.usage).toBe(60);
	expect(check.balance?.breakdown?.[0].current_balance).toBe(140);
	expect(check.balance?.breakdown?.[0].granted_balance).toBe(200);
	expect(check.balance?.breakdown?.[0].usage).toBe(60);

	const checkDb = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(checkDb.balance?.breakdown).toHaveLength(1);
	expect(checkDb.balance?.breakdown?.[0].id).toBe("balance-b");
	expect(checkDb.balance?.current_balance).toBe(140);
	expect(checkDb.balance?.granted_balance).toBe(200);
	expect(checkDb.balance?.usage).toBe(60);
	expect(checkDb.balance?.breakdown?.[0].current_balance).toBe(140);
	expect(checkDb.balance?.breakdown?.[0].granted_balance).toBe(200);
	expect(checkDb.balance?.breakdown?.[0].usage).toBe(60);
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
// DELETE-BALANCE-2D: non-positive deleted balances should not trigger
// recalculation, otherwise surviving balances can be credited.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("delete-balance-2d: recalculate_balances skips non-positive deleted balances")}`, async () => {
	const { customerId, autumnV2, ctx } = await initScenario({
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

	await ctx.db
		.update(customerEntitlements)
		.set({
			balance: -20,
		})
		.where(eq(customerEntitlements.external_id, "balance-a"));

	await deleteCachedFullCustomer({
		ctx,
		customerId,
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
	expect(check.balance?.current_balance).toBe(200);
	expect(check.balance?.granted_balance).toBe(200);
	expect(check.balance?.usage).toBe(0);

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

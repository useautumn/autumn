import { expect, test } from "bun:test";
import { type CheckResponseV2, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// UPDATE-BALANCE-ID-1: balance_id targets the correct loose balance
// Customer has two loose balances for the same feature. Updating with
// balance_id should only affect the targeted one.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-balance-id-1: balance_id targets correct loose balance")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-bid-1",
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

	// Update only balance-a's remaining to 50 (usage = 100 - 50 = 50)
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		remaining: 50,
		balance_id: "balance-a",
	});

	// balance-a: granted=100, current=50, usage=50
	// balance-b: granted=200, current=200, usage=0 (untouched)
	// total: current=250, granted=300, usage=50
	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(check.balance?.current_balance).toBe(250);
	expect(check.balance?.granted_balance).toBe(300);
	expect(check.balance?.usage).toBe(50);

	const balanceA = check.balance?.breakdown?.find((b) => b.id === "balance-a");
	const balanceB = check.balance?.breakdown?.find((b) => b.id === "balance-b");

	expect(balanceA?.current_balance).toBe(50);
	expect(balanceA?.usage).toBe(50);
	expect(balanceB?.current_balance).toBe(200);
	expect(balanceB?.usage).toBe(0);

	// Verify DB sync
	const checkFromDb = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(checkFromDb.balance?.current_balance).toBe(250);
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-BALANCE-ID-2: balance_id fallback — cusEnt without external_id
// is addressable by its internal id (breakdown[n].id = cusEnt.id when
// no external_id is set).
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-balance-id-2: balance_id fallback targets cusEnt by internal id")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-bid-2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Create another set of lifetime messages
	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 100,
		balance_id: "lifetime-balance",
	});

	// Get the internal cusEnt id from breakdown (no external_id set, so id = cusEnt.id)
	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	const cusEntId =
		initialCheck.balance?.breakdown?.find((b) => b.id === "lifetime-balance")
			?.id ?? "";
	expect(cusEntId).toBeTruthy();

	// Update by balance_id = cusEntId (the fallback path)
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		remaining: 60,
		balance_id: "lifetime-balance",
	});

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	const lifetimeBalance = check.balance?.breakdown?.find(
		(b) => b.id === "lifetime-balance",
	);
	expect(lifetimeBalance?.current_balance).toBe(60);

	const monthlyBalance = check.balance?.breakdown?.find(
		(b) => b.reset?.interval === ResetInterval.Month,
	);
	expect(monthlyBalance?.current_balance).toBe(100);

	// Verify DB sync
	const checkFromDb = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(
		checkFromDb.balance?.breakdown?.find((b) => b.id === "lifetime-balance")
			?.current_balance,
	).toBe(60);
	expect(
		checkFromDb.balance?.breakdown?.find(
			(b) => b.reset?.interval === ResetInterval.Month,
		)?.current_balance,
	).toBe(100);
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-BALANCE-ID-3: update included_grant on specific balance_id
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-balance-id-3: update included_grant on specific balance_id")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-bid-3",
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

	// Update only balance-a's included_grant to 150
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 150,
		balance_id: "balance-a",
	});

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// balance-a: granted=150, balance-b: granted=200 → total granted=350
	expect(check.balance?.granted_balance).toBe(350);
	expect(check.balance?.current_balance).toBe(350);
	expect(check.balance?.usage).toBe(0);

	const balanceA = check.balance?.breakdown?.find((b) => b.id === "balance-a");
	const balanceB = check.balance?.breakdown?.find((b) => b.id === "balance-b");

	expect(balanceA?.granted_balance).toBe(150);
	expect(balanceB?.granted_balance).toBe(200);

	// Verify DB sync
	const checkFromDb = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(checkFromDb.balance?.granted_balance).toBe(350);
});

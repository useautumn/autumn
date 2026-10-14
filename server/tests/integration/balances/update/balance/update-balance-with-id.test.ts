import { expect, test } from "bun:test";
import { type CheckResponseV2, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

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

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		remaining: 50,
		balance_id: "balance-a",
	});

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

	const checkFromDb = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(checkFromDb.balance?.current_balance).toBe(250);
});

test.concurrent(`${chalk.yellowBright("update-balance-id-2: balance_id fallback targets cusEnt by internal id")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-bid-2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 100,
		balance_id: "lifetime-balance",
	});

	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	const cusEntId =
		initialCheck.balance?.breakdown?.find((b) => b.id === "lifetime-balance")
			?.id ?? "";
	expect(cusEntId).toBeTruthy();

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

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 100,
		included_grant: 150,
		balance_id: "balance-a",
	});

	const check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(check.balance?.granted_balance).toBe(350);
	expect(check.balance?.current_balance).toBe(300);
	expect(check.balance?.usage).toBe(50);

	const balanceA = check.balance?.breakdown?.find((b) => b.id === "balance-a");
	const balanceB = check.balance?.breakdown?.find((b) => b.id === "balance-b");

	expect(balanceA?.granted_balance).toBe(150);
	expect(balanceB?.granted_balance).toBe(200);

	const checkFromDb = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(checkFromDb.balance?.granted_balance).toBe(350);
});

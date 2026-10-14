import { expect, test } from "bun:test";
import type { ApiCustomer, CheckResponseV2 } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("update-balance-breakdown1: 3 products same feature")}`, async () => {
	const prodA = products.base({ id: "prod-a", items: [items.monthlyMessages({ includedUsage: 100 })] });
	const prodB = products.base({ id: "prod-b", isAddOn: true, items: [items.monthlyMessages({ includedUsage: 50 })] });
	const prodC = products.base({ id: "prod-c", isAddOn: true, items: [items.lifetimeMessages({ includedUsage: 200 })] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-balance-breakdown1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prodA, prodB, prodC] }),
		],
		actions: [
			s.attach({ productId: prodA.id }),
			s.attach({ productId: prodB.id }),
			s.attach({ productId: prodC.id }),
		],
	});

	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(initialCheck.balance).toMatchObject({
		granted_balance: 350,
		current_balance: 350,
		usage: 0,
	});
	expect(initialCheck.balance?.breakdown).toHaveLength(3);

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 300,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 350,
		current_balance: 300,
		usage: 50,
		purchased_balance: 0,
	});

	const check1 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check1.balance?.breakdown).toHaveLength(3);
	const breakdownSum1 = check1.balance?.breakdown?.reduce(
		(sum, b) => sum + (b.current_balance ?? 0),
		0,
	) ?? 0;
	expect(breakdownSum1).toBe(300);

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 400,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 350,
		current_balance: 400,
		usage: -50,
		purchased_balance: 0,
	});

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 350,
		current_balance: 400,
		usage: -50,
	});
});

test.concurrent(`${chalk.yellowBright("update-balance-breakdown2: filter by interval")}`, async () => {
	const monthlyProd = products.base({ id: "monthly-prod", items: [items.monthlyMessages({ includedUsage: 100 })] });
	const lifetimeProd = products.base({ id: "lifetime-prod", isAddOn: true, items: [items.lifetimeMessages({ includedUsage: 200 })] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-balance-breakdown2",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [monthlyProd, lifetimeProd] }),
		],
		actions: [
			s.attach({ productId: monthlyProd.id }),
			s.attach({ productId: lifetimeProd.id }),
		],
	});

	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(initialCheck.balance).toMatchObject({
		granted_balance: 300,
		current_balance: 300,
		usage: 0,
	});
	expect(initialCheck.balance?.breakdown).toHaveLength(2);

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 50,
		interval: ResetInterval.Month,
	});

	const check1 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(check1.balance).toMatchObject({
		granted_balance: 300,
		current_balance: 250,
		usage: 50,
	});

	const breakdowns1 = check1.balance?.breakdown ?? [];
	const monthlyBreakdown1 = breakdowns1.find((b) => b.reset?.interval === "month");
	const lifetimeBreakdown1 = breakdowns1.find((b) => b.reset?.interval === ResetInterval.OneOff);

	expect(monthlyBreakdown1).toMatchObject({
		granted_balance: 100,
		current_balance: 50,
		usage: 50,
	});
	expect(lifetimeBreakdown1).toMatchObject({
		granted_balance: 200,
		current_balance: 200,
		usage: 0,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 100,
		interval: ResetInterval.OneOff,
	});

	const check2 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(check2.balance).toMatchObject({
		granted_balance: 300,
		current_balance: 150,
		usage: 150,
	});

	const breakdowns2 = check2.balance?.breakdown ?? [];
	const monthlyBreakdown2 = breakdowns2.find((b) => b.reset?.interval === "month");
	const lifetimeBreakdown2 = breakdowns2.find((b) => b.reset?.interval === ResetInterval.OneOff);

	expect(monthlyBreakdown2?.granted_balance).toBe(100);
	expect(lifetimeBreakdown2).toMatchObject({
		granted_balance: 200,
		current_balance: 100,
		usage: 100,
	});

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 150,
	});
});

test.concurrent(`${chalk.yellowBright("update-balance-breakdown3: filter by customer_entitlement_id")}`, async () => {
	const prodA = products.base({ id: "prod-a", items: [items.monthlyMessages({ includedUsage: 100 })] });
	const prodB = products.base({ id: "prod-b", isAddOn: true, items: [items.monthlyMessages({ includedUsage: 50 })] });
	const prodC = products.base({ id: "prod-c", isAddOn: true, items: [items.lifetimeMessages({ includedUsage: 200 })] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-balance-breakdown3",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prodA, prodB, prodC] }),
		],
		actions: [
			s.attach({ productId: prodA.id }),
			s.attach({ productId: prodB.id }),
			s.attach({ productId: prodC.id }),
		],
	});

	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	const breakdownIds = initialCheck.balance?.breakdown?.map((b) => ({
		id: b.id!,
		grantedBalance: b.granted_balance!,
	})) ?? [];

	expect(breakdownIds).toHaveLength(3);
	const balances = breakdownIds.map((b) => b.grantedBalance).sort((a, b) => a - b);
	expect(balances).toEqual([50, 100, 200]);

	const targetBreakdown100 = breakdownIds.find((b) => b.grantedBalance === 100);
	expect(targetBreakdown100).toBeDefined();

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 75,
		customer_entitlement_id: targetBreakdown100!.id,
	});

	const check1 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(check1.balance).toMatchObject({
		granted_balance: 350,
		current_balance: 325,
		usage: 25,
	});

	const updatedBreakdown1 = check1.balance?.breakdown?.find((b) => b.id === targetBreakdown100!.id);
	expect(updatedBreakdown1).toMatchObject({
		granted_balance: 100,
		current_balance: 75,
		usage: 25,
	});

	const otherBreakdowns1 = check1.balance?.breakdown?.filter((b) => b.id !== targetBreakdown100!.id) ?? [];
	const otherBalances = otherBreakdowns1.map((b) => b.granted_balance).sort((a, b) => (a ?? 0) - (b ?? 0));
	expect(otherBalances).toEqual([50, 200]);

	const targetBreakdown200 = breakdownIds.find((b) => b.grantedBalance === 200);
	expect(targetBreakdown200).toBeDefined();

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 150,
		customer_entitlement_id: targetBreakdown200!.id,
	});

	const check2 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(check2.balance).toMatchObject({
		granted_balance: 350,
		current_balance: 275,
		usage: 75,
	});

	const updatedBreakdown2 = check2.balance?.breakdown?.find((b) => b.id === targetBreakdown200!.id);
	expect(updatedBreakdown2).toMatchObject({
		granted_balance: 200,
		current_balance: 150,
		usage: 50,
	});

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 350,
		current_balance: 275,
	});
});

test.concurrent(`${chalk.yellowBright("update-balance-breakdown4: update after track spans breakdowns")}`, async () => {
	const prodA = products.base({ id: "prod-a", items: [items.monthlyMessages({ includedUsage: 100 })] });
	const prodB = products.base({ id: "prod-b", isAddOn: true, items: [items.monthlyMessages({ includedUsage: 50 })] });
	const prodC = products.base({ id: "prod-c", isAddOn: true, items: [items.lifetimeMessages({ includedUsage: 200 })] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-balance-breakdown4",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prodA, prodB, prodC] }),
		],
		actions: [
			s.attach({ productId: prodA.id }),
			s.attach({ productId: prodB.id }),
			s.attach({ productId: prodC.id }),
		],
	});

	const trackRes = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 120,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 350,
		current_balance: 230,
		usage: 120,
	});

	const checkAfterTrack = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	const breakdownSum = checkAfterTrack.balance?.breakdown?.reduce(
		(sum, b) => sum + (b.current_balance ?? 0),
		0,
	) ?? 0;
	expect(breakdownSum).toBe(230);
	const usageSum = checkAfterTrack.balance?.breakdown?.reduce(
		(sum, b) => sum + (b.usage ?? 0),
		0,
	) ?? 0;
	expect(usageSum).toBe(120);

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 150,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 350,
		current_balance: 150,
		usage: 200,
		purchased_balance: 0,
	});

	const check1 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	const breakdownSum1 = check1.balance?.breakdown?.reduce(
		(sum, b) => sum + (b.current_balance ?? 0),
		0,
	) ?? 0;
	expect(breakdownSum1).toBe(150);

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 300,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 350,
		current_balance: 300,
		usage: 50,
		purchased_balance: 0,
	});

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 350,
		current_balance: 300,
		usage: 50,
	});
});

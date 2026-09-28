import { expect, test } from "bun:test";
import type { ApiCustomer, ApiEntityV1, CheckResponseV2 } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// UPDATE-BALANCE-FILTERS1: Filter by customer_entitlement_id with 3 monthly products
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-balance-filters1: filter by customer_entitlement_id, update balance without changing included")}`, async () => {
	const messagesItemA = items.monthlyMessages({ includedUsage: 100 });
	const messagesItemB = items.monthlyMessages({ includedUsage: 150 });
	const messagesItemC = items.monthlyMessages({ includedUsage: 200 });

	const productA = products.base({ id: "prod-a", items: [messagesItemA] });
	const productB = products.base({ id: "prod-b", items: [messagesItemB], isAddOn: true });
	const productC = products.base({ id: "prod-c", items: [messagesItemC], isAddOn: true });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-balance-filters1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [productA, productB, productC] }),
		],
		actions: [
			s.attach({ productId: productA.id }),
			s.attach({ productId: productB.id }),
			s.attach({ productId: productC.id }),
		],
	});

	// Initial state: customer has 450 with 3 breakdown items (100 + 150 + 200)
	const initialCustomer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initialCustomer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 450,
		current_balance: 450,
		usage: 0,
	});

	// Get breakdown IDs
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
	expect(balances).toEqual([100, 150, 200]);

	// All IDs should be unique
	const uniqueIds = new Set(breakdownIds.map((b) => b.id));
	expect(uniqueIds.size).toBe(3);

	// TEST 1: Update first breakdown (granted: 100) - set current_balance to 80
	// Expected: usage = 20, granted_balance stays at 100
	const breakdown100 = breakdownIds.find((b) => b.grantedBalance === 100)!;
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 80,
		customer_entitlement_id: breakdown100.id,
	});

	const check1 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total: granted stays 450, current = 430 (100-20 + 150 + 200), usage = 20
	expect(check1.balance).toMatchObject({
		granted_balance: 450, // Unchanged
		current_balance: 430,
		usage: 20,
	});

	// Verify the specific breakdown: granted stays 100, current = 80, usage = 20
	const updatedBreakdown1 = check1.balance?.breakdown?.find((b) => b.id === breakdown100.id);
	expect(updatedBreakdown1?.granted_balance).toBe(100); // Unchanged
	expect(updatedBreakdown1?.current_balance).toBe(80);
	expect(updatedBreakdown1?.usage).toBe(20);

	// Other breakdowns should be unchanged
	const otherBreakdowns1 = check1.balance?.breakdown?.filter((b) => b.id !== breakdown100.id) ?? [];
	const otherGranted1 = otherBreakdowns1.map((b) => b.granted_balance).sort((a, b) => (a ?? 0) - (b ?? 0));
	expect(otherGranted1).toEqual([150, 200]);

	// TEST 2: Update second breakdown (granted: 150) - set current_balance to 200
	// This gives a NEGATIVE usage of -50 (customer gets credit)
	const breakdown150 = breakdownIds.find((b) => b.grantedBalance === 150)!;
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 200,
		customer_entitlement_id: breakdown150.id,
	});

	const check2 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total: granted stays 450, current = 480 (80 + 200 + 200), usage = -30 (20 - 50)
	expect(check2.balance).toMatchObject({
		granted_balance: 450, // Unchanged
		current_balance: 480,
		usage: -30, // 20 from breakdown100 + (-50) from breakdown150
	});

	// Verify the specific breakdown: granted stays 150, current = 200, usage = -50
	const updatedBreakdown2 = check2.balance?.breakdown?.find((b) => b.id === breakdown150.id);
	expect(updatedBreakdown2?.granted_balance).toBe(150); // Unchanged
	expect(updatedBreakdown2?.current_balance).toBe(200);
	expect(updatedBreakdown2?.usage).toBe(-50);

	// TEST 3: Update third breakdown (granted: 200) - set current_balance to 50
	const breakdown200 = breakdownIds.find((b) => b.grantedBalance === 200)!;
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 50,
		customer_entitlement_id: breakdown200.id,
	});

	const check3 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total: granted stays 450, current = 330 (80 + 200 + 50), usage = 120 (20 + (-50) + 150)
	expect(check3.balance).toMatchObject({
		granted_balance: 450, // Unchanged
		current_balance: 330,
		usage: 120,
	});

	// Verify the specific breakdown: granted stays 200, current = 50, usage = 150
	const updatedBreakdown3 = check3.balance?.breakdown?.find((b) => b.id === breakdown200.id);
	expect(updatedBreakdown3?.granted_balance).toBe(200); // Unchanged
	expect(updatedBreakdown3?.current_balance).toBe(50);
	expect(updatedBreakdown3?.usage).toBe(150);

	// Final verification: database state matches cache
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 450, // Unchanged from start
		current_balance: 330,
		usage: 120,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-BALANCE-FILTERS2: Filter with free + prepaid + arrear items
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-balance-filters2: filter by cusEntId with free + prepaid + pay-per-use")}`, async () => {
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const prepaidMessagesItem = items.prepaidMessages({ includedUsage: 0, price: 9, billingUnits: 100 });
	const arrearMessagesItem = items.consumableMessages({ includedUsage: 200, price: 0.1 });

	const freeProd = products.base({ id: "free-prod", items: [freeMessagesItem] });
	const prepaidProd = products.base({ id: "prepaid-prod", items: [prepaidMessagesItem], isAddOn: true });
	const arrearProd = products.base({ id: "arrear-prod", items: [arrearMessagesItem], isAddOn: true });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-balance-filters2",
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [freeProd, prepaidProd, arrearProd] }),
		],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.attach({ productId: prepaidProd.id, options: [{ feature_id: TestFeature.Messages, quantity: 100 }] }),
			s.attach({ productId: arrearProd.id }),
		],
	});

	// Initial state:
	// - Free: granted_balance = 100
	// - Prepaid: purchased_balance = 100 (quantity 100, billing units 100)
	// - Arrear: granted_balance = 200
	// Total: granted = 300, purchased = 100, current = 400
	const initialCustomer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initialCustomer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 400,
		purchased_balance: 100,
		usage: 0,
	});

	// Get breakdown info
	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	const breakdowns = initialCheck.balance?.breakdown?.map((b) => ({
		id: b.id!,
		planId: b.plan_id!,
		grantedBalance: b.granted_balance!,
		currentBalance: b.current_balance!,
		overageAllowed: b.overage_allowed!,
	})) ?? [];

	expect(breakdowns).toHaveLength(3);

	// Find breakdowns by plan_id
	const freeBreakdown = breakdowns.find((b) => b.planId === freeProd.id)!;
	const prepaidBreakdown = breakdowns.find((b) => b.planId === prepaidProd.id)!;
	const arrearBreakdown = breakdowns.find((b) => b.planId === arrearProd.id)!;

	// TEST 1: Update free breakdown (granted: 100) - set current_balance to 75
	// Expected: usage = 25, granted_balance stays at 100
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 75,
		customer_entitlement_id: freeBreakdown.id,
	});

	const check1 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total: granted stays 300, purchased stays 100, current = 375, usage = 25
	expect(check1.balance).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 375,
		purchased_balance: 100, // Unchanged
		usage: 25,
	});

	const updatedFreeBreakdown = check1.balance?.breakdown?.find((b) => b.id === freeBreakdown.id);
	expect(updatedFreeBreakdown?.granted_balance).toBe(100); // Unchanged
	expect(updatedFreeBreakdown?.current_balance).toBe(75);
	expect(updatedFreeBreakdown?.usage).toBe(25);

	// TEST 2: Update prepaid breakdown - set current_balance to 150
	// Expected: usage = -50 (credit), purchased_balance stays at 100
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 150,
		customer_entitlement_id: prepaidBreakdown.id,
	});

	const check2 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	const updatedPrepaidBreakdown = check2.balance?.breakdown?.find((b) => b.id === prepaidBreakdown.id);
	expect(updatedPrepaidBreakdown?.current_balance).toBe(150);

	// TEST 3: Update arrear breakdown - set current_balance to 150
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 150,
		customer_entitlement_id: arrearBreakdown.id,
	});

	const check3 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	const updatedArrearBreakdown = check3.balance?.breakdown?.find((b) => b.id === arrearBreakdown.id);
	expect(updatedArrearBreakdown?.granted_balance).toBe(200); // Unchanged
	expect(updatedArrearBreakdown?.current_balance).toBe(150);
	expect(updatedArrearBreakdown?.overage_allowed).toBe(true);

	// TEST 4: Update arrear to negative (-50) - overage goes to purchased_balance
	// When current_balance would go negative, it stays at 0 and overage becomes purchased_balance
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: -50,
		customer_entitlement_id: arrearBreakdown.id,
	});

	const check4 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	const negativeArrearBreakdown = check4.balance?.breakdown?.find((b) => b.id === arrearBreakdown.id);
	expect(negativeArrearBreakdown).toMatchObject({
		granted_balance: 200, // Unchanged
		current_balance: 0, // Stays at 0, doesn't go negative
		purchased_balance: 50, // Overage goes here
		usage: 250, // 200 granted + 50 purchased = 250 usage
	});

	// Final verification
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	const customerFromCache = await autumnV2.customers.get<ApiCustomer>(customerId);

	expect(customerFromDb.balances[TestFeature.Messages].current_balance).toBe(
		customerFromCache.balances[TestFeature.Messages].current_balance,
	);
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-BALANCE-FILTERS3: Entity products and per-entity balances
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-balance-filters3: entity products and per-entity balance filter")}`, async () => {
	const entityProductMessages = items.monthlyMessages({ includedUsage: 100 });
	const perEntityMessages = items.monthlyMessages({ includedUsage: 50, entityFeatureId: TestFeature.Users });

	const entityProd = products.base({ id: "entity-prod", items: [entityProductMessages] });
	const perEntityProd = products.base({ id: "per-entity-prod", items: [perEntityMessages] });

	const { customerId, autumnV2, entities } = await initScenario({
		customerId: "update-balance-filters3",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [entityProd, perEntityProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach entity product to each entity
			s.attach({ productId: entityProd.id, entityIndex: 0 }),
			s.attach({ productId: entityProd.id, entityIndex: 1 }),
			// Attach per-entity product to customer
			s.attach({ productId: perEntityProd.id }),
		],
	});

	// Initial: each entity has 150 (100 entity prod + 50 per-entity)
	for (const entity of entities) {
		const fetchedEntity = await autumnV2.entities.get<ApiEntityV1>(customerId, entity.id);
		expect(fetchedEntity.balances?.[TestFeature.Messages]).toMatchObject({
			granted_balance: 150,
			current_balance: 150,
			usage: 0,
		});
	}

	// Customer total: 2 * (100 + 50) = 300
	const initialCustomer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initialCustomer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 300,
		usage: 0,
	});

	// Get breakdown IDs for entity 0
	const entity0Check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
	});

	const entityProdBreakdown0 = entity0Check.balance?.breakdown?.find((b) => b.granted_balance === 100);
	const perEntityBreakdown = entity0Check.balance?.breakdown?.find((b) => b.granted_balance === 50);

	// Get entity product breakdown for entity 1
	const entity1Check = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
	});

	const entityProdBreakdown1 = entity1Check.balance?.breakdown?.find((b) => b.granted_balance === 100);

	// Entity products have unique cusEntIds per entity
	expect(entityProdBreakdown0?.id).not.toBe(entityProdBreakdown1?.id);

	// TEST 1: Update entity product for entity 0 (100 → 75)
	// Expected: usage = 25, granted_balance stays at 100
	await autumnV2.balances.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		current_balance: 75,
		customer_entitlement_id: entityProdBreakdown0!.id,
	});

	// Entity 0: granted = 150 (100 + 50), current = 125 (75 + 50), usage = 25
	const entity0 = await autumnV2.entities.get<ApiEntityV1>(customerId, entities[0].id);
	expect(entity0.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150, // Unchanged
		current_balance: 125,
		usage: 25,
	});

	// Entity 1 should be unchanged: granted = 150, current = 150
	const entity1 = await autumnV2.entities.get<ApiEntityV1>(customerId, entities[1].id);
	expect(entity1.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 150,
		usage: 0,
	});

	// Customer total: granted = 300, current = 275, usage = 25
	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 275,
		usage: 25,
	});

	// TEST 2: Update entity product for entity 1 (100 → 120)
	// Expected: usage = -20 (credit), granted_balance stays at 100
	await autumnV2.balances.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		current_balance: 120,
		customer_entitlement_id: entityProdBreakdown1!.id,
	});

	// Entity 1: granted = 150, current = 170 (120 + 50), usage = -20
	const entity1Updated = await autumnV2.entities.get<ApiEntityV1>(customerId, entities[1].id);
	expect(entity1Updated.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150, // Unchanged
		current_balance: 170,
		usage: -20,
	});

	// Customer total: granted = 300, current = 295, usage = 5 (25 - 20)
	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 295,
		usage: 5,
	});

	// TEST 3: Update per-entity balance for entity 0 (50 → 30)
	await autumnV2.balances.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		current_balance: 30,
		customer_entitlement_id: perEntityBreakdown!.id,
	});

	// Entity 0: granted = 150, current = 105 (75 + 30), usage = 45 (25 + 20)
	const entity0Updated = await autumnV2.entities.get<ApiEntityV1>(customerId, entities[0].id);
	expect(entity0Updated.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150, // Unchanged
		current_balance: 105,
		usage: 45,
	});

	// Entity 1 should still have its per-entity balance of 50
	const entity1Final = await autumnV2.entities.get<ApiEntityV1>(customerId, entities[1].id);
	expect(entity1Final.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 170,
		usage: -20,
	});

	// Final verification
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customerFromDb.balances[TestFeature.Messages].granted_balance).toBe(300); // Unchanged
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-BALANCE-FILTERS4: Filter by interval (monthly vs lifetime)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-balance-filters4: filter by interval (monthly vs lifetime)")}`, async () => {
	const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });
	const lifetimeMessages = items.lifetimeMessages({ includedUsage: 200 });

	const monthlyProd = products.base({ id: "monthly-prod", items: [monthlyMessages] });
	const lifetimeProd = products.base({ id: "lifetime-prod", items: [lifetimeMessages], isAddOn: true });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-balance-filters4",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [monthlyProd, lifetimeProd] }),
		],
		actions: [
			s.attach({ productId: monthlyProd.id }),
			s.attach({ productId: lifetimeProd.id }),
		],
	});

	// Initial: customer has 300 with monthly (100) and lifetime (200)
	const initialCustomer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initialCustomer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300,
		current_balance: 300,
		usage: 0,
	});

	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(initialCheck.balance?.breakdown).toHaveLength(2);

	const monthlyBreakdown = initialCheck.balance?.breakdown?.find((b) => b.reset?.interval === "month");
	const lifetimeBreakdown = initialCheck.balance?.breakdown?.find((b) => b.reset?.interval === "one_off");

	expect(monthlyBreakdown?.granted_balance).toBe(100);
	expect(lifetimeBreakdown?.granted_balance).toBe(200);

	// TEST 1: Update only monthly breakdown (100 → 75) using interval filter
	// Expected: granted stays 100, current = 75, usage = 25
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 75,
		interval: ResetInterval.Month,
	});

	const check1 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total: granted stays 300, current = 275, usage = 25
	expect(check1.balance).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 275,
		usage: 25,
	});

	const updatedMonthly1 = check1.balance?.breakdown?.find((b) => b.reset?.interval === "month");
	expect(updatedMonthly1?.granted_balance).toBe(100); // Unchanged
	expect(updatedMonthly1?.current_balance).toBe(75);

	const unchangedLifetime1 = check1.balance?.breakdown?.find((b) => b.reset?.interval === "one_off");
	expect(unchangedLifetime1?.granted_balance).toBe(200);
	expect(unchangedLifetime1?.current_balance).toBe(200);

	// TEST 2: Update only lifetime breakdown (200 → 150) using interval filter
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 150,
		interval: ResetInterval.OneOff,
	});

	const check2 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total: granted stays 300, current = 225, usage = 75
	expect(check2.balance).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 225,
		usage: 75,
	});

	const updatedLifetime2 = check2.balance?.breakdown?.find((b) => b.reset?.interval === "one_off");
	expect(updatedLifetime2?.granted_balance).toBe(200); // Unchanged
	expect(updatedLifetime2?.current_balance).toBe(150);

	// TEST 3: Increase monthly breakdown (75 → 125) using interval filter
	// Expected: usage becomes negative (-25)
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 125,
		interval: ResetInterval.Month,
	});

	const check3 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total: granted stays 300, current = 275, usage = 25
	expect(check3.balance).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 275,
		usage: 25, // monthly (-25) + lifetime (50) = 25
	});

	const updatedMonthly3 = check3.balance?.breakdown?.find((b) => b.reset?.interval === "month");
	expect(updatedMonthly3?.granted_balance).toBe(100); // Unchanged
	expect(updatedMonthly3?.current_balance).toBe(125);

	// TEST 4: Increase lifetime breakdown (150 → 300)
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 300,
		interval: ResetInterval.OneOff,
	});

	const check4 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total: granted stays 300, current = 425, usage = -125
	expect(check4.balance).toMatchObject({
		granted_balance: 300, // Unchanged
		current_balance: 425,
		usage: -125, // monthly (-25) + lifetime (-100) = -125
	});

	const updatedLifetime4 = check4.balance?.breakdown?.find((b) => b.reset?.interval === "one_off");
	expect(updatedLifetime4?.granted_balance).toBe(200); // Unchanged
	expect(updatedLifetime4?.current_balance).toBe(300);

	// Final verification
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 300, // Unchanged from start
		current_balance: 425,
		usage: -125,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-BALANCE-FILTERS5: Interval filter with multiple products per interval
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-balance-filters5: interval filter with multiple products, sequential deduction")}`, async () => {
	const monthlyMessagesA = items.monthlyMessages({ includedUsage: 100 });
	const monthlyMessagesB = items.monthlyMessages({ includedUsage: 150 });
	const lifetimeMessagesC = items.lifetimeMessages({ includedUsage: 200 });
	const lifetimeMessagesD = items.lifetimeMessages({ includedUsage: 50 });

	const monthlyProdA = products.base({ id: "monthly-prod-a", items: [monthlyMessagesA] });
	const monthlyProdB = products.base({ id: "monthly-prod-b", items: [monthlyMessagesB], isAddOn: true });
	const lifetimeProdC = products.base({ id: "lifetime-prod-c", items: [lifetimeMessagesC], isAddOn: true });
	const lifetimeProdD = products.base({ id: "lifetime-prod-d", items: [lifetimeMessagesD], isAddOn: true });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-balance-filters5",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [monthlyProdA, monthlyProdB, lifetimeProdC, lifetimeProdD] }),
		],
		actions: [
			s.attach({ productId: monthlyProdA.id }),
			s.attach({ productId: monthlyProdB.id }),
			s.attach({ productId: lifetimeProdC.id }),
			s.attach({ productId: lifetimeProdD.id }),
		],
	});

	// Initial: customer has 500 with 2 monthly (250) and 2 lifetime (250)
	const initialCustomer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initialCustomer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 500,
		current_balance: 500,
		usage: 0,
	});

	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(initialCheck.balance?.breakdown).toHaveLength(4);

	const monthlyBreakdowns = initialCheck.balance?.breakdown?.filter((b) => b.reset?.interval === "month") ?? [];
	const lifetimeBreakdowns = initialCheck.balance?.breakdown?.filter((b) => b.reset?.interval === "one_off") ?? [];

	expect(monthlyBreakdowns).toHaveLength(2);
	expect(lifetimeBreakdowns).toHaveLength(2);

	const monthlySum = monthlyBreakdowns.reduce((s, b) => s + (b.granted_balance ?? 0), 0);
	const lifetimeSum = lifetimeBreakdowns.reduce((s, b) => s + (b.granted_balance ?? 0), 0);
	expect(monthlySum).toBe(250);
	expect(lifetimeSum).toBe(250);

	// TEST 1: Decrease monthly balance from 250 to 150 (usage = 100)
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 150,
		interval: ResetInterval.Month,
	});

	const check1 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total: granted stays 500, current = 400, usage = 100
	expect(check1.balance).toMatchObject({
		granted_balance: 500, // Unchanged
		current_balance: 400,
		usage: 100,
	});

	const monthlySum1 = check1.balance?.breakdown?.filter((b) => b.reset?.interval === "month")
		.reduce((s, b) => s + (b.current_balance ?? 0), 0) ?? 0;
	expect(monthlySum1).toBe(150);

	// Lifetime should be unchanged
	const lifetimeSum1 = check1.balance?.breakdown?.filter((b) => b.reset?.interval === "one_off")
		.reduce((s, b) => s + (b.current_balance ?? 0), 0) ?? 0;
	expect(lifetimeSum1).toBe(250);

	// TEST 2: Decrease monthly balance from 150 to 50 (additional usage = 100)
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 50,
		interval: ResetInterval.Month,
	});

	const check2 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total: granted stays 500, current = 300, usage = 200
	expect(check2.balance).toMatchObject({
		granted_balance: 500, // Unchanged
		current_balance: 300,
		usage: 200,
	});

	const monthlySum2 = check2.balance?.breakdown?.filter((b) => b.reset?.interval === "month")
		.reduce((s, b) => s + (b.current_balance ?? 0), 0) ?? 0;
	expect(monthlySum2).toBe(50);

	// TEST 3: Decrease lifetime balance from 250 to 100 (usage = 150)
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 100,
		interval: ResetInterval.OneOff,
	});

	const check3 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total: granted stays 500, current = 150, usage = 350
	expect(check3.balance).toMatchObject({
		granted_balance: 500, // Unchanged
		current_balance: 150,
		usage: 350,
	});

	const lifetimeSum3 = check3.balance?.breakdown?.filter((b) => b.reset?.interval === "one_off")
		.reduce((s, b) => s + (b.current_balance ?? 0), 0) ?? 0;
	expect(lifetimeSum3).toBe(100);

	// TEST 4: Increase monthly balance from 50 to 200 (credit = 150)
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 200,
		interval: ResetInterval.Month,
	});

	const check4 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total: granted stays 500, current = 300, usage = 200
	expect(check4.balance).toMatchObject({
		granted_balance: 500, // Unchanged
		current_balance: 300,
		usage: 200, // monthly (50) + lifetime (150) = 200
	});

	const monthlySum4 = check4.balance?.breakdown?.filter((b) => b.reset?.interval === "month")
		.reduce((s, b) => s + (b.current_balance ?? 0), 0) ?? 0;
	expect(monthlySum4).toBe(200);

	// TEST 5: Increase lifetime balance from 100 to 350 (credit = 250)
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 350,
		interval: ResetInterval.OneOff,
	});

	const check5 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total: granted stays 500, current = 550, usage = -50
	expect(check5.balance).toMatchObject({
		granted_balance: 500, // Unchanged
		current_balance: 550,
		usage: -50, // monthly (50) + lifetime (-100) = -50
	});

	const lifetimeSum5 = check5.balance?.breakdown?.filter((b) => b.reset?.interval === "one_off")
		.reduce((s, b) => s + (b.current_balance ?? 0), 0) ?? 0;
	expect(lifetimeSum5).toBe(350);

	// Final verification
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 500, // Unchanged from start
		current_balance: 550,
		usage: -50,
	});
});

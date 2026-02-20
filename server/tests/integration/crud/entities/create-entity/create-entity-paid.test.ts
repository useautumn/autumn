import { expect, test } from "bun:test";
import {
	CustomerExpand,
	type LimitedItem,
	OnDecrease,
	OnIncrease,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import chalk from "chalk";
import { addHours, addMonths, addWeeks } from "date-fns";
import { Decimal } from "decimal.js";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { timeout } from "@/utils/genUtils.js";
import {
	constructArrearProratedItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	calcProrationAndExpectInvoice,
	expectSubQuantityCorrect,
	useEntityBalanceAndExpect,
} from "./utils/expectEntityUtils.js";

/**
 * Tests for creating/deleting paid entities (seats) with billing
 * Converted from: server/tests/contUse/entities/entity1.test.ts
 *
 * Pro product is $20/month base + $50/user seat
 * Tests verify:
 * - Creating entities generates correct invoices
 * - Deleting entities creates replaceables (credit for deleted seats)
 * - Creating new entities uses replaceables before charging
 */
test.concurrent(`${chalk.yellowBright("create-entity-paid: entity1 - create/delete entities with billing")}`, async () => {
	// Custom user item with $50/user, 1 included, bill immediately on increase
	const userItem = constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: 50,
		includedUsage: 1,
		config: {
			on_increase: OnIncrease.BillImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({ items: [userItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "create-entity-paid-1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	let usage = 0;

	// Step 1: Create first entity, then attach pro
	const firstEntities = [
		{ id: "1", name: "test", feature_id: TestFeature.Users },
	];
	await autumnV1.entities.create(customerId, firstEntities);
	usage += 1;

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Step 2: Create 2 more entities and verify invoice
	const entities = [
		{ id: "2", name: "test", feature_id: TestFeature.Users },
		{ id: "3", name: "test2", feature_id: TestFeature.Users },
	];
	await autumnV1.entities.create(customerId, entities);
	await timeout(3000);
	usage += entities.length;

	await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage,
		itemQuantity: usage,
	});

	let customer = await autumnV1.customers.get(customerId);
	let invoices = customer.invoices!;
	expect(invoices.length).toBe(2);
	expect(invoices[0].total).toBe(userItem.price! * entities.length);

	// Step 3: Delete 1 entity - should create replaceable, no new invoice
	await autumnV1.entities.delete(customerId, entities[0].id);

	customer = await autumnV1.customers.get(customerId);
	invoices = customer.invoices!;
	expect(invoices.length).toBe(2);

	await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage,
		numReplaceables: 1,
		itemQuantity: usage - 1,
	});

	// Step 4: Create 2 new entities - should only pay for 1 (other uses replaceable)
	const newEntities = [
		{ id: "4", name: "test3", feature_id: TestFeature.Users },
		{ id: "5", name: "test4", feature_id: TestFeature.Users },
	];
	await autumnV1.entities.create(customerId, newEntities);
	await timeout(3000);
	usage += 1; // Only 1 because 1 uses the replaceable

	customer = await autumnV1.customers.get(customerId);
	invoices = customer.invoices!;

	expect(invoices.length).toBe(3);
	expect(invoices[0].total).toBe(userItem.price!);

	await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage,
		itemQuantity: usage,
	});
});

/**
 * Tests for entities with prorate immediately on increase/decrease
 * Converted from: server/tests/contUse/entities/entity2.test.ts
 *
 * Pro product is $20/month base + $50/user seat with prorate immediately
 * Tests verify:
 * - Creating entities generates prorated invoices
 * - Deleting entities generates prorated credit invoices
 */
test.concurrent(`${chalk.yellowBright("create-entity-paid: entity2 - prorate immediately on increase/decrease")}`, async () => {
	// Custom user item with $50/user, 1 included, prorate immediately on both increase/decrease
	const userItem = constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: 50,
		includedUsage: 1,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const pro = products.pro({ items: [userItem] });

	const { customerId, autumnV1, testClockId } = await initScenario({
		customerId: "create-entity-paid-2",
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	let usage = 0;
	let curUnix = Date.now();

	// Step 1: Create first entity, then attach pro
	const firstEntities = [
		{ id: "1", name: "test", feature_id: TestFeature.Users },
	];
	await autumnV1.entities.create(customerId, firstEntities);
	usage += 1;

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Step 2: Advance 2 weeks, create 2 entities and verify prorated invoice
	const newEntities = [
		{ id: "2", name: "test", feature_id: TestFeature.Users },
		{ id: "3", name: "test2", feature_id: TestFeature.Users },
	];

	curUnix = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addWeeks(new Date(), 2).getTime(),
		waitForSeconds: 30,
	});

	await autumnV1.entities.create(customerId, newEntities);
	usage += newEntities.length;

	const { stripeSubs } = await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage,
		itemQuantity: usage,
	});

	await timeout(5000);

	await calcProrationAndExpectInvoice({
		autumn: autumnV1,
		stripeSubs,
		customerId,
		quantity: newEntities.length,
		unitPrice: userItem.price!,
		curUnix,
		numInvoices: 2,
	});

	// Step 3: Advance 1 week, delete 1 entity and verify prorated credit invoice
	curUnix = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addWeeks(curUnix, 1).getTime(),
		waitForSeconds: 30,
	});

	await timeout(5000);

	await autumnV1.entities.delete(customerId, newEntities[0].id);
	usage -= 1;

	const { stripeSubs: stripeSubs2 } = await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage,
	});

	await calcProrationAndExpectInvoice({
		autumn: autumnV1,
		stripeSubs: stripeSubs2,
		customerId,
		quantity: -1,
		unitPrice: userItem.price!,
		curUnix,
		numInvoices: 3,
	});
});

/**
 * Tests for replaceables being deleted at end of billing cycle
 * Converted from: server/tests/contUse/entities/entity3.test.ts
 *
 * Pro product is $20/month base + $50/user seat
 * Tests verify:
 * - Deleting entities mid-cycle creates replaceables
 * - At cycle renewal, replaceables are cleared and subscription is correct
 */
test.concurrent(`${chalk.yellowBright("create-entity-paid: entity3 - replaceables deleted at end of cycle")}`, async () => {
	// Custom user item with $50/user, 1 included, bill immediately on increase, no change on decrease
	const userItem = constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: 50,
		includedUsage: 1,
		config: {
			on_increase: OnIncrease.BillImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({ items: [userItem] });

	const { customerId, autumnV1, testClockId } = await initScenario({
		customerId: "create-entity-paid-3",
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	let usage = 0;

	// Step 1: Create three entities, then attach pro
	const firstEntities = [
		{ id: "1", name: "test", feature_id: TestFeature.Users },
		{ id: "2", name: "test", feature_id: TestFeature.Users },
		{ id: "3", name: "test", feature_id: TestFeature.Users },
	];
	await autumnV1.entities.create(customerId, firstEntities);
	usage += firstEntities.length;

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Step 2: Advance 2 weeks, delete 2 entities - should have replaceables, no new invoice
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addWeeks(new Date(), 2).getTime(),
		waitForSeconds: 30,
	});

	await autumnV1.entities.delete(customerId, firstEntities[0].id);
	await autumnV1.entities.delete(customerId, firstEntities[1].id);

	const numReplaceables = 2;
	await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage,
		numReplaceables,
		itemQuantity: usage - numReplaceables,
	});

	let customer = await autumnV1.customers.get(customerId);
	let invoices = customer.invoices!;
	expect(invoices.length).toBe(1);

	// Step 3: Advance to next cycle - replaceables should be cleared
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addHours(
			addMonths(new Date(), 1),
			hoursToFinalizeInvoice,
		).getTime(),
	});

	usage -= 2; // 2 entities deleted

	customer = await autumnV1.customers.get(customerId);
	invoices = customer.invoices!;

	const basePrice = getBasePrice({ product: pro });
	expect(invoices.length).toBe(2);
	expect(invoices[0].total).toBe(basePrice); // Only base price, 0 extra entities beyond included

	await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage,
		itemQuantity: usage,
		numReplaceables: 0,
	});
});

/**
 * Tests for per-entity features (e.g., messages per user)
 * Converted from: server/tests/contUse/entities/entity4.test.ts
 *
 * Pro product has:
 * - $50/user seat with 1 included
 * - 500 messages per entity (per user)
 *
 * Tests verify:
 * - Per-entity balances are tracked correctly
 * - Using balance at top level vs entity level
 * - Deleting and creating entities maintains correct balances
 */
test.concurrent(`${chalk.yellowBright("create-entity-paid: entity4 - per entity features")}`, async () => {
	// User item with $50/user, 1 included
	const userItem = constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: 50,
		includedUsage: 1,
		config: {
			on_increase: OnIncrease.BillImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	// Per-entity messages: 500 messages per user entity
	const perEntityItem = constructFeatureItem({
		featureId: TestFeature.Messages,
		entityFeatureId: TestFeature.Users,
		includedUsage: 500,
	}) as LimitedItem;

	const pro = products.pro({ items: [userItem, perEntityItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "create-entity-paid-4",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	let usage = 0;

	// Step 1: Create one entity, then attach pro
	const firstEntities = [
		{ id: "1", name: "test", feature_id: TestFeature.Users },
	];
	await autumnV1.entities.create(customerId, firstEntities);
	usage += firstEntities.length;

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Step 2: Create 2 more entities and verify message balance
	const newEntities = [
		{ id: "2", name: "test", feature_id: TestFeature.Users },
		{ id: "3", name: "test", feature_id: TestFeature.Users },
	];
	await autumnV1.entities.create(customerId, newEntities);
	usage += newEntities.length;

	const customer = await autumnV1.customers.get(customerId, {
		expand: [CustomerExpand.Entities],
	});

	const res = await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(res.balance).toBe((perEntityItem.included_usage as number) * usage);

	// Verify each entity has correct balance
	// @ts-expect-error - entities may not be typed
	for (const entity of customer.entities) {
		const entRes = await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entity.id ?? "",
		});
		expect(entRes.balance).toBe(perEntityItem.included_usage);
	}

	// Step 3: Use from top level balance
	const deduction = 600;
	const perEntityIncluded = perEntityItem.included_usage as number;

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: deduction,
	});
	await timeout(5000);

	const { balance } = await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(balance).toBe(perEntityIncluded * usage - deduction);

	// Step 4: Use from entity balances
	await useEntityBalanceAndExpect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		entityId: "2",
	});

	await useEntityBalanceAndExpect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		entityId: "3",
	});

	// Step 5: Delete one entity and create a new one - master balance should remain same
	const deletedEntityId = "2";
	const newEntity = {
		id: "4",
		name: "test",
		feature_id: TestFeature.Users,
	};

	const { balance: masterBalanceBefore } = await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	const { balance: entityBalanceBefore } = await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: deletedEntityId,
	});

	await autumnV1.entities.delete(customerId, deletedEntityId);
	await autumnV1.entities.create(customerId, [newEntity]);

	const { balance: masterBalanceAfter } = await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(new Decimal(masterBalanceAfter ?? 0).toDP(5).toNumber()).toBe(
		new Decimal(masterBalanceBefore ?? 0).toDP(5).toNumber(),
	);

	const { balance: entityBalanceAfter } = await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: newEntity.id,
	});

	expect(entityBalanceAfter).toBe(entityBalanceBefore);
});

/**
 * Tests for payment failures when creating entities
 * Converted from: server/tests/contUse/entities/entity5.test.ts
 *
 * Tests verify:
 * - Creating entities fails gracefully when payment fails
 * - Tracking usage fails gracefully when payment fails
 * - Subscription state remains unchanged after failure
 */
test.concurrent(`${chalk.yellowBright("create-entity-paid: entity5 - payment failure handling")}`, async () => {
	// User item with $50/user, 1 included
	const userItem = constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: 50,
		includedUsage: 1,
		config: {
			on_increase: OnIncrease.BillImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({ items: [userItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "create-entity-paid-5",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	let usage = 0;

	// Step 1: Create one entity, then attach pro
	const firstEntities = [
		{ id: "1", name: "test", feature_id: TestFeature.Users },
	];
	await autumnV1.entities.create(customerId, firstEntities);
	usage += firstEntities.length;

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Step 2: Attach a failing payment method
	const fullCus = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	await attachFailedPaymentMethod({
		stripeCli: ctx.stripeCli,
		customer: fullCus,
	});

	// Step 3: Try to create entities - should fail
	await expectAutumnError({
		errMessage: "card was declined.",
		func: async () => {
			await autumnV1.entities.create(customerId, [
				{ id: "2", name: "test", feature_id: TestFeature.Users },
				{ id: "3", name: "test", feature_id: TestFeature.Users },
			]);
		},
	});

	await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage,
		numReplaceables: 0,
	});

	// Step 4: Try to track usage - should fail
	await expectAutumnError({
		errMessage: "card was declined.",
		func: async () => {
			return await autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: 2,
			});
		},
	});

	await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage,
		numReplaceables: 0,
	});
});

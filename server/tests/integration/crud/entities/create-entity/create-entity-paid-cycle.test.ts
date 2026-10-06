import { expect, test } from "bun:test";
import { OnDecrease, OnIncrease } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntil } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import chalk from "chalk";
import { addHours, addMonths, addWeeks } from "date-fns";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import {
	calcProrationAndExpectInvoice,
	expectSubQuantityCorrect,
} from "./utils/expectEntityUtils.js";

/**
 * Tests for entities with prorate immediately on increase/decrease
 * Converted from: server/tests/contUse/entities/entity2.test.ts
 *
 * Pro product is $20/month base + $50/user seat with prorate immediately
 * Tests verify:
 * - Creating entities generates prorated invoices
 * - Deleting entities generates prorated credit invoices
 */
test.concurrent(
	`${chalk.yellowBright("create-entity-paid: entity2 - prorate immediately on increase/decrease")}`,
	async () => {
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

		// The prorated credit invoice is recorded from the async Stripe invoice webhook.
		await pollUntil({
			fetch: () => autumnV1.customers.get(customerId),
			until: (customer) => customer.invoices.length >= 3,
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
	},
);

/**
 * Tests for replaceables being deleted at end of billing cycle
 * Converted from: server/tests/contUse/entities/entity3.test.ts
 *
 * Pro product is $20/month base + $50/user seat
 * Tests verify:
 * - Deleting entities mid-cycle creates replaceables
 * - At cycle renewal, replaceables are cleared and subscription is correct
 */
test.concurrent(
	`${chalk.yellowBright("create-entity-paid: entity3 - replaceables deleted at end of cycle")}`,
	async () => {
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
	},
);

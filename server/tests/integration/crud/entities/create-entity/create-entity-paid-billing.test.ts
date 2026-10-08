import { expect, test } from "bun:test";
import { OnDecrease, OnIncrease } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { expectSubQuantityCorrect } from "./utils/expectEntityUtils.js";

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
test.concurrent(
	`${chalk.yellowBright("create-entity-paid: entity1 - create/delete entities with billing")}`,
	async () => {
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
	},
);

/**
 * Tests for payment failures when creating entities
 * Converted from: server/tests/contUse/entities/entity5.test.ts
 *
 * Tests verify:
 * - Creating entities fails gracefully when payment fails
 * - Tracking usage fails gracefully when payment fails
 * - Subscription state remains unchanged after failure
 */
test.concurrent(
	`${chalk.yellowBright("create-entity-paid: entity5 - payment failure handling")}`,
	async () => {
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
			ctx,
			idOrInternalId: customerId,
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
	},
);

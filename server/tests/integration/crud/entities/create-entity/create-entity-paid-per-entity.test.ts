import { expect, test } from "bun:test";
import {
	CustomerExpand,
	type LimitedItem,
	OnDecrease,
	OnIncrease,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { timeout } from "@/utils/genUtils.js";
import {
	constructArrearProratedItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { useEntityBalanceAndExpect } from "./utils/expectEntityUtils.js";

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
test.concurrent(
	`${chalk.yellowBright("create-entity-paid: entity4 - per entity features")}`,
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
	},
);

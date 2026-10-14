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

test.concurrent(
	`${chalk.yellowBright("create-entity-paid: entity4 - per entity features")}`,
	async () => {
		const userItem = constructArrearProratedItem({
			featureId: TestFeature.Users,
			pricePerUnit: 50,
			includedUsage: 1,
			config: {
				on_increase: OnIncrease.BillImmediately,
				on_decrease: OnDecrease.None,
			},
		});

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

		const firstEntities = [
			{ id: "1", name: "test", feature_id: TestFeature.Users },
		];
		await autumnV1.entities.create(customerId, firstEntities);
		usage += firstEntities.length;

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

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

		// @ts-expect-error - entities may not be typed
		for (const entity of customer.entities) {
			const entRes = await autumnV1.check({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				entity_id: entity.id ?? "",
			});
			expect(entRes.balance).toBe(perEntityItem.included_usage);
		}

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

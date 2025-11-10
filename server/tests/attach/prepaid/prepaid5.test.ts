import { type Customer, LegacyVersion, OnDecrease, OnIncrease } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import type Stripe from "stripe";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "prepaid5";

export const prepaidAddOn = constructProduct({
	type: "pro",
	excludeBase: true,
	id: "topup",
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			billingUnits: 100,
			price: 12.5,
			config: {
				on_increase: OnIncrease.ProrateImmediately,
				on_decrease: OnDecrease.None,
			},
		}),
	],
	isAddOn: true,
});

export const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 250,
		}),
	],
});
export const premium = constructProduct({
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
		}),
	],
});

describe(`${chalk.yellowBright(`attach/${testCase}: prepaid add on, with entities`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;

	const curUnix = new Date().getTime();
	let customer: Customer;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro, premium, prepaidAddOn],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: false,
		});

		customer = res.customer;
		// testClockId = res.testClockId!;
	});

	const entity1Id = "1";
	const entity2Id = "2";
	const entities = [
		{
			id: entity1Id,
			name: "entity1",
			feature_id: TestFeature.Users,
		},
		{
			id: entity2Id,
			name: "entity2",
			feature_id: TestFeature.Users,
		},
	];

	test("should attach pro product to entity1", async () => {
		await autumn.entities.create(customerId, entities);

		await attachAndExpectCorrect({
			autumn,
			customerId,
			entityId: entity1Id,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});

		await attachAndExpectCorrect({
			autumn,
			customerId,
			entityId: entity1Id,
			product: prepaidAddOn,
			otherProducts: [pro],
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 100,
				},
			],
			numSubs: 2,
		});
	});

	const oldEntity2Quantity = 300;
	test("should advance test clock and attach top up to entity2", async () => {
		// await advanceTestClock({
		//   stripeCli,
		//   testClockId,
		//   advanceTo: addWeeks(new Date(), 2).getTime(),
		//   waitForSeconds: 10,
		// });

		await attachAndExpectCorrect({
			autumn,
			customerId,
			entityId: entity2Id,
			product: premium,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			numSubs: 3,
		});

		await attachAndExpectCorrect({
			autumn,
			customerId,
			entityId: entity2Id,
			product: prepaidAddOn,
			otherProducts: [premium],
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: oldEntity2Quantity,
				},
			],
			numSubs: 4,
		});
	});

	test("should increase prepaid add on quantity for entity1", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			entityId: entity1Id,
			product: prepaidAddOn,
			otherProducts: [pro],
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 200,
				},
			],
			numSubs: 4,
			waitForInvoice: 10000,
		});
	});

	const newEntity2Quantity = 200;
	test("should decrease prepaid add on quantity for entity2", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			entityId: entity2Id,
			product: prepaidAddOn,
			otherProducts: [premium],
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: newEntity2Quantity,
				},
			],
			numSubs: 4,
			waitForInvoice: 5000,
		});

		const entity2 = await autumn.entities.get(customerId, entity2Id);
		expect(entity2.invoices.length).toBe(2);
		const creditProd = entity2.products.find(
			(p: any) => p.id == prepaidAddOn.id,
		);
		expect(creditProd).toBeDefined();
		const messagesItem = creditProd!.items.find(
			(i: any) => i.feature_id == TestFeature.Messages,
		);

		expect(messagesItem).toBeDefined();
		expect(messagesItem.quantity).toBe(oldEntity2Quantity);
		expect(messagesItem.next_cycle_quantity).toBe(newEntity2Quantity);
	});

	return;
});

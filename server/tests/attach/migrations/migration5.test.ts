import { beforeAll, describe, expect, test } from "bun:test";
import { OnDecrease, OnIncrease } from "@autumn/shared";
import { defaultApiVersion } from "@tests/constants.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearProratedItem,
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectSubToBeCorrect } from "../../merged/mergeUtils/expectSubCorrect.js";
import { timeout } from "../../utils/genUtils.js";
import { replaceItems } from "../../utils/testProductUtils/testProductUtils.js";

const prepaidSeats = constructPrepaidItem({
	featureId: TestFeature.Users,
	billingUnits: 1,
	price: 40,
	includedUsage: 0,
	config: {
		on_increase: OnIncrease.ProrateNextCycle,
		on_decrease: OnDecrease.ProrateNextCycle,
	},
});

const msgItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	entityFeatureId: TestFeature.Users,
});

const pro = constructProduct({
	id: "pro",
	items: [prepaidSeats, msgItem],
	type: "pro",
	isDefault: false,
});

const testCase = "migrations5";
const entities = [
	{
		id: "1",
		name: "Entity 1",
		feature_id: TestFeature.Users,
	},
	{
		id: "2",
		name: "Entity 2",
		feature_id: TestFeature.Users,
	},
	{
		id: "3",
		name: "Entity 3",
		feature_id: TestFeature.Users,
	},
	{
		id: "4",
		name: "Entity 4",
		feature_id: TestFeature.Users,
	},
];

describe(`${chalk.yellowBright(`${testCase}: Testing migration for prepaid seats -> pay_per_use seats`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: defaultApiVersion });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});
	});

	test("should attach pro product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [
				{
					feature_id: TestFeature.Users,
					quantity: 3,
				},
			],
		});

		await autumn.entities.create(customerId, entities);
	});

	test("should update product to new version", async () => {
		await autumn.products.update(pro.id, {
			items: replaceItems({
				items: pro.items,
				featureId: TestFeature.Users,
				newItem: constructArrearProratedItem({
					featureId: TestFeature.Users,
					pricePerUnit: 40,
					includedUsage: 1,
				}),
			}),
		});

		await autumn.migrate({
			from_product_id: pro.id,
			to_product_id: pro.id,
			from_version: 1,
			to_version: 2,
		});

		await timeout(3000);
		// await autumn.attach({
		// 	customer_id: customerId,
		// 	product_id: pro.id,
		// 	version: 2,
		// });

		// 1. Should have 3 seats
		const customer = await autumn.customers.get(customerId);
		const seats = customer.features[TestFeature.Users].balance;
		expect(seats).toBe(-3); // 3 in overage

		const messages = customer.features[TestFeature.Messages].balance;
		expect(messages).toBe(400);

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	});
});

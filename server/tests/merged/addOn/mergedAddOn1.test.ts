import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectSubToBeCorrect } from "../mergeUtils/expectSubCorrect.js";

// UNCOMMENT FROM HERE

const pro = constructProduct({
	id: "pro",
	items: [constructFeatureItem({ featureId: TestFeature.Credits })],
	type: "pro",
});

const billingUnits = 100;
const addOn = constructRawProduct({
	id: "addOn",
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Credits,
			billingUnits,
			price: 10,
		}),
		constructArrearItem({
			featureId: TestFeature.Words,
			billingUnits: 100,
		}),
	],
	isAddOn: true,
});

const ops = [
	{
		product: pro,
		results: [{ product: pro, status: CusProductStatus.Active }],
	},
	{
		product: addOn,
		results: [
			{ product: pro, status: CusProductStatus.Active },
			{ product: addOn, status: CusProductStatus.Active },
		],
		options: [
			{
				feature_id: TestFeature.Credits,
				quantity: billingUnits * 3,
			},
		],
		otherProducts: [pro],
	},

	// Update quantity
	{
		product: addOn,
		results: [
			{ product: pro, status: CusProductStatus.Active },
			{ product: addOn, status: CusProductStatus.Active },
		],
		options: [
			{
				feature_id: TestFeature.Credits,
				quantity: billingUnits * 5,
			},
		],
		otherProducts: [pro],
	},
];

const testCase = "mergedAddOn1";
describe(`${chalk.yellowBright("mergedAddOn1: Adding an add on")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro, addOn],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});

		stripeCli = ctx.stripeCli;
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
		testClockId = res.testClockId!;
	});

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
	];

	test("should run operations", async () => {
		await autumn.entities.create(customerId, entities);

		for (let index = 0; index < ops.length; index++) {
			const op = ops[index];
			await attachAndExpectCorrect({
				autumn,
				customerId,
				product: op.product,
				stripeCli,
				db,
				org,
				env,
				entities,
				options: op.options,
				otherProducts: op.otherProducts,
			});

			for (const result of op.results) {
				// const entity = await autumn.entities.get(customerId, op.entityId);
				const cus = await autumn.customers.get(customerId);
				expectProductAttached({
					customer: cus,
					product: result.product,
					status: result.status,
				});
			}
		}
	});

	test("should cancel add on product and have correct sub items", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: addOn.id,
			cancel_immediately: false,
		});

		await expectSubToBeCorrect({
			customerId,
			db,
			org,
			env,
		});

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: addOn,
			status: CusProductStatus.Active,
		});
		expectProductAttached({
			customer,
			product: pro,
			status: CusProductStatus.Active,
		});
	});

	test("should advance to next invoice and have no add on product", async () => {
		await advanceToNextInvoice({
			stripeCli,
			testClockId,
		});

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
			status: CusProductStatus.Active,
		});
		const products = customer.products.filter((p) => p.group === addOn.group);
		expect(products.length).toBe(1);
	});
});

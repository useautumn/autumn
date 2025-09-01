import {
	APIVersion,
	type AppEnv,
	CusProductStatus,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const premium = constructProduct({
	id: "premium",
	items: [constructFeatureItem({ featureId: TestFeature.Credits })],
	type: "premium",
});

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
	],
	isAddOn: true,
});

const ops = [
	{
		entityId: "1",
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
	},
	{
		entityId: "1",
		product: addOn,
		results: [
			{ product: premium, status: CusProductStatus.Active },
			{ product: addOn, status: CusProductStatus.Active },
		],
		options: [
			{
				feature_id: TestFeature.Credits,
				quantity: billingUnits * 3,
			},
		],
		otherProducts: [premium],
	},

	{
		entityId: "2",
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
	},
	{
		entityId: "2",
		product: addOn,
		results: [
			{ product: premium, status: CusProductStatus.Active },
			{ product: addOn, status: CusProductStatus.Active },
		],
		options: [
			{
				feature_id: TestFeature.Credits,
				quantity: billingUnits * 5,
			},
		],
		otherProducts: [premium],
	},
	{
		entityId: "3",
		product: pro,
		results: [{ product: pro, status: CusProductStatus.Active }],
	},
	{
		entityId: "3",
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
	{
		entityId: "1",
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

const testCase = "mergedAddOn6";
describe(`${chalk.yellowBright("mergedAddOn6: testing update add on quantities on many entities")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

	let stripeCli: Stripe;
	let _testClockId: string;
	let _curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [pro, addOn, premium],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnJs,
			products: [pro, addOn, premium],
			db,
			orgId: org.id,
			env,
			customerId,
		});

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		_testClockId = testClockId1!;
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
		{
			id: "3",
			name: "Entity 3",
			feature_id: TestFeature.Users,
		},
	];

	it("should run operations", async () => {
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
				entityId: op.entityId,
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
	return;

	it("should update prepaid quantity for entity 1 and 2", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: addOn,
			stripeCli,
			db,
			org,
			env,
			entities,
			entityId: "1",
			options: [
				{
					feature_id: TestFeature.Credits,
					quantity: billingUnits * 3,
				},
			],
		});
	});
});

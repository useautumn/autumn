import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
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
import { expectSubToBeCorrect } from "../mergeUtils/expectSubCorrect.js";

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
		entityId: "1",
		product: pro,
		results: [
			{ product: premium, status: CusProductStatus.Active },
			{ product: addOn, status: CusProductStatus.Active },
			{ product: pro, status: CusProductStatus.Scheduled },
		],
		otherProducts: [premium],
	},
];

const testCase = "mergedAddOn4";
describe(`${chalk.yellowBright("mergedAddOn4: testing cancelling add on immediately while there's scheduled product")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
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

		testClockId = testClockId1!;
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

	it("should cancel add on product immediately", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: addOn.id,
			entity_id: "1",
			cancel_immediately: true,
		});

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
			status: CusProductStatus.Scheduled,
		});
		expectProductAttached({
			customer,
			product: premium,
			status: CusProductStatus.Active,
		});

		const products = customer.products.filter((p) => p.group === addOn.group);
		expect(products.length).to.equal(2);

		await expectSubToBeCorrect({
			customerId,
			db,
			org,
			env,
		});
	});
});

import {
	APIVersion,
	type AppEnv,
	CusProductStatus,
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
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const premium = constructProduct({
	id: "premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
});
const addOn = constructProduct({
	id: "free_add_on",
	items: [constructFeatureItem({ featureId: TestFeature.Credits })],
	type: "free",
	isAddOn: true,
	isDefault: false,
});

const ops = [
	{
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
		skipSubCheck: true,
	},
	{
		product: addOn,
		results: [
			{ product: premium, status: CusProductStatus.Active },
			{ product: addOn, status: CusProductStatus.Active },
		],
	},
];

const testCase = "cancel4";
describe(`${chalk.yellowBright("cancel4: Cancelling free add on product")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

	let stripeCli: Stripe;
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
			products: [premium, addOn],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnJs,
			products: [premium, addOn],
			db,
			orgId: org.id,
			env,
			customerId,
		});

		await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});
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
			try {
				await attachAndExpectCorrect({
					autumn,
					customerId,
					product: op.product,
					stripeCli,
					db,
					org,
					env,
					skipSubCheck: op.skipSubCheck,
				});
			} catch (error) {
				console.log(`Operation failed: ${op.product.id}, index: ${index}`);
				throw error;
			}
		}
	});

	it("should track usage cancel, advance test clock and have correct invoice", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: addOn.id,
			cancel_immediately: true,
		});

		const cus = await autumn.customers.get(customerId);
		expectProductAttached({
			customer: cus,
			product: premium,
		});

		const products = cus.products.filter((p) => p.group === addOn.group);
		expect(products.length).to.equal(1);
	});
});

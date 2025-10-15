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
const free = constructProduct({
	id: "free",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
		}),
	],
	type: "free",
	isDefault: false,
});

const ops = [
	{
		product: free,
		results: [{ product: free, status: CusProductStatus.Active }],
		skipSubCheck: true,
	},
];

const testCase = "cancel3";
describe(`${chalk.yellowBright("cancel3: Cancelling free product")}`, () => {
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
			products: [free],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnJs,
			products: [free],
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
		const cus1 = await autumn.customers.get(customerId);

		await autumn.cancel({
			customer_id: customerId,
			product_id: free.id,
			cancel_immediately: true,
		});

		const cus = await autumn.customers.get(customerId);
		const prods = cus.products.filter((p) => p.group == free.group);
		expect(prods.length).to.equal(0);
	});
});

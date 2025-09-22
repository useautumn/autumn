import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Stripe } from "stripe";
import { createProducts } from "tests/utils/productUtils.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
	APIVersion,
	AppEnv,
	CusProductStatus,
	Organization,
} from "@autumn/shared";
import {
	constructArrearItem,
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { advanceToNextInvoice } from "tests/utils/testAttachUtils/testAttachUtils.js";
import { expect } from "chai";
import { expectSubToBeCorrect } from "../mergeUtils/expectSubCorrect.js";

// UNCOMMENT FROM HERE

let pro = constructProduct({
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
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

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
			products: [pro, addOn],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnJs,
			products: [pro, addOn],
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

	it("should run operations", async function () {
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

	it("should cancel add on product and have correct sub items", async function () {
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

	// return;
	it("should advance to next invoice and have no add on product", async function () {
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
		expect(products.length).to.equal(1);
	});
});

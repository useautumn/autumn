import { APIVersion, type AppEnv, type Organization } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import { completeInvoiceCheckout } from "tests/utils/stripeUtils/completeInvoiceCheckout.js";
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
import { addPrefixToProducts } from "../utils.js";

export const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	type: "pro",
});

export const addOn = constructRawProduct({
	id: "addOn",
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			billingUnits: 100,
			price: 10,
			isOneOff: true,
		}),
	],
});

const testCase = "checkout7";
describe(`${chalk.yellowBright(`${testCase}: Testing invoice checkout with one off product`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_2 });
	let _testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let _stripeCli: Stripe;
	const _curUnix = Date.now();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		_stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [pro, addOn],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro, addOn],
			customerId,
			db,
			orgId: org.id,
			env,
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

	it("should attach pro product, then add on product via invoice checkout", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const options = [
			{
				quantity: 200,
				feature_id: TestFeature.Messages,
			},
		];

		const res2 = await autumn.checkout({
			customer_id: customerId,
			product_id: addOn.id,
			invoice: true,
			options,
		});

		expect(res2.url).to.exist;

		await completeInvoiceCheckout({
			url: res2.url!,
		});

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: addOn,
		});

		expectFeaturesCorrect({
			customer,
			product: addOn,
			otherProducts: [pro],
			options,
		});
	});

	// it("should have no URL returned if try to attach add on (with invoice true)", async function () {
	//   const res = await autumn.checkout({
	//     customer_id: customerId,
	//     product_id: addOn.id,
	//     invoice: true,
	//   });

	//   expect(res.url).to.not.exist;
	// });
});

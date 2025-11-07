import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { createProducts } from "tests/utils/productUtils.js";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

export const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
		}),
		constructPrepaidItem({
			isOneOff: true,
			featureId: TestFeature.Users,
			billingUnits: 1,
			price: 100,
		}),
	],
	isAnnual: true,
	type: "pro",
});

const testCase = "others8";

describe(`${chalk.yellowBright(`${testCase}: Testing annual pro with one off prepaid`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	before(async function () {
		await setupBefore(this);
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		await initCustomer({
			db,
			org,
			env,
			autumn: this.autumnJs,
			customerId,
			fingerprint: "test",
			attachPm: "success",
		});

		addPrefixToProducts({
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			db,
			orgId: org.id,
			env,
			autumn,
			products: [pro],
		});
	});

	it("should attach annual pro product with one off prepaid", async () => {
		const options = [
			{
				feature_id: TestFeature.Users,
				quantity: 1,
			},
		];

		const preview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: pro.id,
			options,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			options,
		});

		console.log(preview);

		const customer = await autumn.customers.get(customerId);

		const invoice = customer.invoices[0];
		// expect(preview.total).to.equal(invoice.total);
		expect(invoice.total).to.equal(
			getBasePrice({ product: pro }) + options[0].quantity * 100,
		);
	});
});

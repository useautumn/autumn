import { AllowanceType, ApiVersion, Infinite, type Organization } from "@autumn/shared";
import type { AppEnv, Autumn } from "autumn-js";
import { expect } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { initCustomerV2 } from "@/utils/scriptUtils/initCustomer.js";
import { TestFeature } from "tests/setup/v2Features.js";

const testCase = "trackMisc7";
const customerId = `${testCase}_cus1`;

// Free feature (included only, no price) - should cap at 0
const freeItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
});
const pro = constructProduct({
	id: "pro",
	items: [freeItem],
	type: "pro",
});

describe(`${chalk.yellowBright(`trackMisc/${testCase}: Testing free balance capping`)}`, () => {
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;
	let stripeCli: Stripe;
	let autumnInt: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	let autumnJs: Autumn;

	before(async function () {
		await setupBefore(this);
		db = this.db;
		org = this.org;
		env = this.env;
		stripeCli = this.stripeCli;
		autumnJs = this.autumnJs;

		try {
			await autumnInt.customers.delete(customerId);
		} catch (_) {}

		await addPrefixToProducts({
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnInt,
			products: [pro],
			customerId,
			db,
			orgId: org.id,
			env,
		});
	});

	it("should create customer and attach product", async () => {
		const { customer } = await initCustomerV2({
			autumn: autumnInt,
			customerId,
			org,
			env,
			db,
			attachPm: "success",
		});
		await autumnJs.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(customer).to.exist;
		expect(customer.id).to.equal(customerId);
	});

	it("should cap free balance at 0 when tracking more than available", async () => {
		const customer = await autumnInt.customers.get(customerId);
		const initialBalance = customer.features[TestFeature.Messages].balance;
		expect(initialBalance).to.equal(50, `Initial balance should be 50, got ${initialBalance}`);

		console.log(`🚀 Tracking 60 units with free balance of 50 (should cap at 0)...`);

		await autumnInt.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 60,
		});

		const finalCustomer = await autumnInt.customers.get(customerId);
		const finalBalance = finalCustomer.features[TestFeature.Messages].balance;
		const finalUsage = finalCustomer.features[TestFeature.Messages].usage;

		console.log(`📦 Final state: balance=${finalBalance}, usage=${finalUsage}`);

		expect(finalBalance).to.equal(0, `Balance should cap at 0, got ${finalBalance}`);
		expect(finalUsage).to.equal(50, `Usage should be 50, got ${finalUsage}`);
	});
});

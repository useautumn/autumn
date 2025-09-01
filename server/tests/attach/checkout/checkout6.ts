import { APIVersion, type AppEnv, type Organization } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import { completeInvoiceCheckout } from "tests/utils/stripeUtils/completeInvoiceCheckout.js";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
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

export const premium = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 250,
		}),
	],
	type: "premium",
});

const testCase = "checkout6";
describe(`${chalk.yellowBright(`${testCase}: Testing invoice checkout via checkout endpoint`)}`, () => {
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
			products: [pro, premium],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro, premium],
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

	it("should attach pro product via invoice checkout", async () => {
		const res = await autumn.checkout({
			customer_id: customerId,
			product_id: pro.id,
			invoice: true,
		});

		expect(res.url).to.exist;

		await completeInvoiceCheckout({
			url: res.url!,
		});

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: pro,
		});

		expectFeaturesCorrect({
			customer,
			product: pro,
		});
	});

	it("should have no URL returned if try to attach premium (with invoice true)", async () => {
		await expectAutumnError({
			func: async () => {
				await autumn.attach({
					customer_id: customerId,
					product_id: premium.id,
					invoice: true,
				});
			},
		});

		const res = await autumn.checkout({
			customer_id: customerId,
			product_id: premium.id,
			invoice: true,
		});

		expect(res.url).to.not.exist;
	});

	it("should attach premium product via invoice enable immediately", async () => {
		const _res = await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
			invoice: true,
			enable_product_immediately: true,
		});

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: premium,
		});

		expectFeaturesCorrect({
			customer,
			product: premium,
		});

		const invoices = customer.invoices;
		expect(invoices.length).to.equal(2);
		expect(invoices[0].status).to.equal("draft");
		expect(invoices[0].total).to.equal(
			getBasePrice({ product: premium }) - getBasePrice({ product: pro }),
		); // proration...
	});
});

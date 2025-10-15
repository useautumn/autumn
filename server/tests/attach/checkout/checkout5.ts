import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
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

const testCase = "checkout5";
describe(`${chalk.yellowBright(`${testCase}: Testing invoice checkout, no product till paid`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_2 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;
	const curUnix = new Date().getTime();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro],
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
			// attachPm: "success",
		});

		testClockId = testClockId1!;
	});

	it("should attach pro  product", async () => {
		const res = await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			invoice: true,
		});

		const customer = await autumn.customers.get(customerId);

		const invoice = customer.invoices?.[0];

		expect(invoice).to.exist;
		expect(invoice.total).to.equal(getBasePrice({ product: pro }));
		expect(invoice.status).to.equal("open");

		const product = customer.products.find((p) => p.id === pro.id);
		expect(product).to.not.exist;

		await completeInvoiceCheckout({
			url: res.checkout_url,
		});

		const customer2 = await autumn.customers.get(customerId);

		const invoice2 = customer2.invoices?.[0];

		expect(customer2.invoices.length).to.equal(1);
		expect(invoice2).to.exist;
		expect(invoice2.status).to.equal("paid");

		expectProductAttached({
			customer: customer2,
			product: pro,
		});

		expectFeaturesCorrect({
			customer: customer2,
			product: pro,
		});
	});
});

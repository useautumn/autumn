import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Stripe } from "stripe";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { expect } from "chai";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { getMainCusProduct } from "tests/utils/cusProductUtils/cusProductUtils.js";
import { timeout } from "@/utils/genUtils.js";

// UNCOMMENT FROM HERE
let pro = constructProduct({
	id: "pro",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "pro",
});

describe(`${chalk.yellowBright("advancedOthers1: Testing convert collection method from send_invoice")}`, () => {
	let customerId = "advancedOthers1";
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
			products: [pro],
			prefix: customerId,
		});

		await createProducts({
			autumn: autumnJs,
			products: [pro],
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

	it("should attach pro product and pay for it", async function () {
		const res = await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			invoice: true,
			enable_product_immediately: true,
		});

		expect(res.invoice).to.exist;
		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
		});

		const invoiceStripeId = res.invoice.stripe_id;
		const invoice = await stripeCli.invoices.finalizeInvoice(invoiceStripeId);

		await stripeCli.invoices.pay(invoiceStripeId);
	});

	it("should have collection method charge automatically", async function () {
		await timeout(5000);

		const cusProduct = await getMainCusProduct({
			db,
			customerId,
			orgId: org.id,
			env,
			productGroup: pro.group,
		});

		const sub = await cusProductToSub({
			cusProduct,
			stripeCli,
		});

		expect(sub?.collection_method).to.equal("charge_automatically");
	});
});

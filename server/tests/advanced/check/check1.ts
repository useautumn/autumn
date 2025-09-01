import { APIVersion, type Customer, type LimitedItem } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const creditCost = 0.2;
const freeProduct = constructProduct({
	id: "free",
	items: [constructFeatureItem({ featureId: TestFeature.Action1 })],
	type: "free",
	isDefault: false,
});

const creditFeatureItem = constructFeatureItem({
	featureId: TestFeature.Credits,
}) as LimitedItem;
const pro = constructProduct({
	id: "pro",
	items: [creditFeatureItem],
	type: "pro",
});

const testCase = "check1";
describe(`${chalk.yellowBright("check1: Checking credit systems")}`, () => {
	const customerId = testCase;
	let _testClockId: string;
	let _customer: Customer;
	let _stripeCli: Stripe;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

	before(async function () {
		await setupBefore(this);
		_stripeCli = this.stripeCli;

		const { customer: customer_, testClockId: testClockId_ } =
			await initCustomer({
				customerId,
				org: this.org,
				env: this.env,
				db: this.db,
				autumn: this.autumnJs,
				attachPm: "success",
			});

		addPrefixToProducts({
			products: [freeProduct, pro],
			prefix: testCase,
		});
		await createProducts({
			products: [freeProduct, pro],
			orgId: this.org.id,
			env: this.env,
			autumn: this.autumnJs,
			db: this.db,
		});

		_customer = customer_;
		_testClockId = testClockId_;
	});

	it("should attach free product and check action1 allowed", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: freeProduct.id,
		});

		const actionCheck = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
		});

		const creditsCheck = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		});

		expect(actionCheck.allowed).to.be.true;
		expect(creditsCheck.allowed).to.be.false;
	});

	it("should attach pro product and check allowed", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const creditsCheck = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		});

		const actionCheck = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
		});

		expect(actionCheck.allowed).to.be.true;
		expect(creditsCheck.allowed).to.be.true;
	});

	it("should use up credits and have correct check response", async () => {
		const usage = 50;
		const creditUsage = new Decimal(creditCost).mul(usage).toNumber();

		const creditBalance = new Decimal(creditFeatureItem.included_usage)
			.sub(creditUsage)
			.toNumber();

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: usage,
		});

		await timeout(3000);

		const creditsCheck = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		});

		expect(creditsCheck.balance).to.be.equal(creditBalance);
	});
});

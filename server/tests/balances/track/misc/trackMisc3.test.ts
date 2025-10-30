import {
	ApiVersion,
	type Organization,
	ProductItemFeatureType,
} from "@autumn/shared";
import type { AppEnv, Autumn } from "autumn-js";
import { expect } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV2 } from "@/utils/scriptUtils/initCustomer.js";

const testCase = "trackMisc3";
const customerId = `${testCase}_cus1`;

const userItem = constructFeatureItem({
	featureId: TestFeature.Users,
	includedUsage: 1,
	featureType: ProductItemFeatureType.ContinuousUse,
});

const pro = constructProduct({
	id: "pro",
	items: [userItem],
	type: "pro",
});

describe(`${chalk.yellowBright(`trackMisc/${testCase}: Testing trackMisc track prepaid allocated feature with concurrent requests`)}`, () => {
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;
	let stripeCli: Stripe;
	const autumnInt: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	let autumnJs: Autumn;

	before(async function () {
		await setupBefore(this);
		db = this.db;
		org = this.org;
		env = this.env;
		stripeCli = this.stripeCli;
		autumnJs = this.autumnJs;
		try {
			await (autumnInt as AutumnInt).customers.delete(customerId);
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

	it("should create a customer and issue balances", async () => {
		const { customer } = await initCustomerV2({
			autumn: autumnInt,
			customerId,
			org,
			env,
			db,
			attachPm: "success",
		});
		expect(customer).to.exist;
		expect(customer.id).to.equal(customerId);
		expect(customer.name).to.equal(customerId);
		expect(customer.email).to.equal(`${customerId}@example.com`);

		await autumnJs.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	it("should only allow one concurrent seat allocation with 1 included seat and create no duplicate invoices", async () => {
		const customer = await autumnInt.customers.get(customerId);
		const balance = customer.features[TestFeature.Users].balance;
		expect(balance).to.equal(
			1,
			`Balance should be 1, got ${balance} | Balances: ${JSON.stringify(customer.features)}`,
		);

		const initialInvoices = await stripeCli.invoices.list({
			customer: customer.stripe_id as string,
		});
		const initialInvoiceCount = initialInvoices.data.length;

		// Try to allocate 5 different seats concurrently - only 1 should succeed (the included seat)
		// The other 4 should be rejected because we only have 1 included seat
		const promises = [
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: 1,
			}),
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: 1,
			}),
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: 1,
			}),
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: 1,
			}),
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: 1,
			}),
		];

		const results = await Promise.allSettled(promises);

		const successCount = results.filter((r) => r.status === "fulfilled").length;
		const rejectedCount = results.filter((r) => r.status === "rejected").length;

		expect(successCount).to.equal(
			1,
			`Expected exactly 1 success (included seat), got ${successCount} | Results: ${results.map((r) => r.status).join(", ")}`,
		);
		expect(rejectedCount).to.equal(
			4,
			`Expected exactly 4 rejections (exceeded included), got ${rejectedCount} | Results: ${results.map((r) => r.status).join(", ")}`,
		);

		const { data: balances, error } = await autumnJs.customers.get(customerId);
		expect(error).to.be.null;
		expect(balances?.features[TestFeature.Users]?.balance).to.equal(
			0,
			`Balance should be 0 (allocated feature), got ${balances?.features[TestFeature.Users]?.balance}`,
		);

		// Verify no duplicate invoices were created
		// Since we only allocated the 1 included seat, no overage charges should occur
		const finalInvoices = await stripeCli.invoices.list({
			customer: customer.stripe_id as string,
		});
		const finalInvoiceCount = finalInvoices.data.length;
		const newInvoicesCreated = finalInvoiceCount - initialInvoiceCount;

		expect(newInvoicesCreated).to.equal(
			0,
			`Expected 0 new invoices (only used included seat), got ${newInvoicesCreated}. Initial: ${initialInvoiceCount}, Final: ${finalInvoiceCount}`,
		);
	});
});

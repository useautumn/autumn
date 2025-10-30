import { ApiVersion, type Organization } from "@autumn/shared";
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
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV2 } from "@/utils/scriptUtils/initCustomer.js";

const testCase = "trackMisc4";
const customerId = `${testCase}_cus1`;

const messageItem = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 5,
	price: 0.1,
	billingUnits: 1,
	usageLimit: 10,
});

const pro = constructProduct({
	id: "pro",
	items: [messageItem],
	type: "pro",
});

describe(`${chalk.yellowBright(`trackMisc/${testCase}: Testing usage_limits with PayPerUse feature and concurrent requests`)}`, () => {
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
		}).catch((_) => {});
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

	it("should enforce usage_limit with concurrent requests", async () => {
		const customer = await autumnInt.customers.get(customerId);
		console.log("customer", customer);
		const balance = customer.features[TestFeature.Messages].balance;
		const usageLimit = customer.features[TestFeature.Messages].usage_limit;

		expect(balance).to.equal(5, `Balance should be 5, got ${balance}`);
		expect(usageLimit).to.equal(
			10,
			`Usage limit should be 10, got ${usageLimit}`,
		);

		console.log(
			"🚀 Starting 5 concurrent track calls (3 units each) at exact same time...",
		);
		console.log(
			`   Initial state: balance=${balance}, usage_limit=${usageLimit} (max total usage in billing cycle)`,
		);

		// Try to use 3 units concurrently - with usage_limit of 10, only 3 requests can succeed (3x3=9 <= 10)
		const promises = [
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 3,
			}),
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 3,
			}),
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 3,
			}),
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 3,
			}),
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 3,
			}),
		];

		const results = await Promise.allSettled(promises);

		console.log("📊 Results breakdown:");
		results.forEach((result, index) => {
			if (result.status === "rejected") {
				console.log(
					`  [${index}] ❌ REJECTED:`,
					result.reason?.message || result.reason,
				);
				console.log(`       Error code:`, result.reason?.code);
				console.log(`       Status code:`, result.reason?.statusCode);
			} else {
				console.log(
					`  [${index}] ✅ FULFILLED (HTTP 200):`,
					JSON.stringify(result.value),
				);
			}
		});

		const successCount = results.filter((r) => r.status === "fulfilled").length;
		const rejectedCount = results.filter((r) => r.status === "rejected").length;
		console.log(
			`\n📈 Summary: ${successCount} HTTP 200 responses, ${rejectedCount} HTTP errors`,
		);

		expect(successCount).to.equal(3, `Expected exactly 3 HTTP 200 responses, got ${successCount}`);
		expect(rejectedCount).to.equal(2, `Expected exactly 2 HTTP errors (usage_limit exceeded), got ${rejectedCount}`);

		// Wait for any async processing to complete
		console.log(`⏳ Waiting 3s for all updates to persist...`);
		await new Promise((resolve) => setTimeout(resolve, 3000));

		const { data: balances, error } = await autumnJs.customers.get(customerId);

		console.log(`📦 Final state after all requests:`);
		console.log(
			`- Balance: ${balances?.features[TestFeature.Messages]?.balance} (expected: -4)`,
		);
		console.log(
			`- Usage: ${balances?.features[TestFeature.Messages]?.usage} (expected: 9)`,
		);
		console.log(
			`- Usage limit: ${balances?.features[TestFeature.Messages]?.usage_limit} (expected: 10)`,
		);

		expect(balances?.features[TestFeature.Messages]?.balance).to.equal(
			-4,
			`Balance should be -4 (5 included - 9 used), got ${balances?.features[TestFeature.Messages]?.balance}`,
		);
		expect(balances?.features[TestFeature.Messages]?.usage).to.equal(
			9,
			`Usage should be 9, got ${balances?.features[TestFeature.Messages]?.usage}`,
		);
		expect(balances?.features[TestFeature.Messages]?.usage_limit).to.equal(
			10,
			`Usage limit should remain 10, got ${balances?.features[TestFeature.Messages]?.usage_limit}`,
		);
		// With usage_limit of 10, only 3 requests of value 3 can succeed (9 total)
		// The 4th request would bring total to 12, exceeding the usage_limit
		// expect(successCount).to.equal(3, `Expected exactly 3 successes (3x3=9 <= usage_limit of 10), got ${successCount} | Results: ${results.map(r => r.status).join(", ")}`);
		// expect(rejectedCount).to.equal(2, `Expected exactly 2 rejections, got ${rejectedCount} | Results: ${results.map(r => r.status).join(", ")}`);

		// expect(error).to.be.null;

		// Balance consumed from included: min(9, 5) = 5, so balance = 0
		// The remaining 4 units (9 - 5) are overages charged via PayPerUse
		// expect(balances?.features[TestFeature.Messages]?.balance).to.equal(
		// 	0,
		// 	`Balance should be 0 (all 5 included used), got ${balances?.features[TestFeature.Messages]?.balance}`,
		// );
		// expect(balances?.features[TestFeature.Messages]?.usage_limit).to.equal(
		// 	10,
		// 	`Usage limit should remain 10, got ${balances?.features[TestFeature.Messages]?.usage_limit}`,
		// );
	});
});

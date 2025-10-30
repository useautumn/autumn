import { ApiVersion, type Organization } from "@autumn/shared";
import type { AppEnv, Autumn } from "autumn-js";
import { expect } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearItem, constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { initCustomerV2 } from "@/utils/scriptUtils/initCustomer.js";
import { TestFeature } from "tests/setup/v2Features.js";

const testCase = "trackMisc6";
const prepaidCustomerId = `${testCase}_prepaid_cus`;
const payPerUseCustomerId = `${testCase}_payperuse_cus`;

// Prepaid feature: 5 included, no overage allowed
const prepaidItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 5,
});

// PayPerUse feature: 5 included, overage allowed at $0.01 per unit, usage_limit of 10
const payPerUseItem = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 5,
	price: 0.01,
	billingUnits: 1,
	usageLimit: 10,
});

const prepaidProduct = constructProduct({
    id: "prepaid",
    items: [prepaidItem],
    type: "pro",
});

const payPerUseProduct = constructProduct({
    id: "payperuse",
    items: [payPerUseItem],
    type: "pro",
});

describe(`${chalk.yellowBright(`trackMisc/${testCase}: Testing prepaid vs PayPerUse overage behavior`)}`, () => {
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

		// Delete both customers
		try {
			await (autumnInt as AutumnInt).customers.delete(prepaidCustomerId);
		} catch (_) {}
		try {
			await (autumnInt as AutumnInt).customers.delete(payPerUseCustomerId);
		} catch (_) {}

        await addPrefixToProducts({
            products: [prepaidProduct, payPerUseProduct],
            prefix: testCase,
        })

        // Create products for prepaid customer
        await createProducts({
            autumn: autumnInt,
            products: [prepaidProduct],
            customerId: prepaidCustomerId,
            db,
            orgId: org.id,
            env,
        })

		// Create products for pay-per-use customer
		await createProducts({
            autumn: autumnInt,
            products: [payPerUseProduct],
            customerId: payPerUseCustomerId,
            db,
            orgId: org.id,
            env,
        })
	});

	it("should create prepaid customer and attach product", async () => {
        const { customer } = await initCustomerV2({
            autumn: autumnInt,
            customerId: prepaidCustomerId,
            org,
            env,
            db,
            attachPm: "success",
        })
		expect(customer).to.exist;
		expect(customer.id).to.equal(prepaidCustomerId);

        await autumnJs.attach({
            customer_id: prepaidCustomerId,
            product_id: prepaidProduct.id,
        })
	});

	it("should create pay-per-use customer and attach product", async () => {
        const { customer } = await initCustomerV2({
            autumn: autumnInt,
            customerId: payPerUseCustomerId,
            org,
            env,
            db,
            attachPm: "success",
        })
		expect(customer).to.exist;
		expect(customer.id).to.equal(payPerUseCustomerId);

        await autumnJs.attach({
            customer_id: payPerUseCustomerId,
            product_id: payPerUseProduct.id,
        })
	});

	it("should reject tracking 7 units when prepaid balance is 5 (no overage)", async () => {
		const customer = await autumnInt.customers.get(prepaidCustomerId);
		const balance = customer.features[TestFeature.Messages].balance;
		expect(balance).to.equal(5, `Balance should be 5, got ${balance}`);

		console.log("🚀 Tracking 7 units with prepaid balance of 5 (no overage allowed)...");

		let error: any = null;
		try {
			await autumnInt.track({
				customer_id: prepaidCustomerId,
				feature_id: TestFeature.Messages,
				value: 7,
			});
		} catch (e) {
			error = e;
		}

		expect(error).to.exist;
		expect(error.message).to.include("Insufficient balance");
		expect(error.message).to.include("Available: 5");
		expect(error.message).to.include("Required: 7");

		console.log("❌ Request rejected:", error.message);

		// Verify balance remains unchanged
		const finalCustomer = await autumnInt.customers.get(prepaidCustomerId);
		const finalBalance = finalCustomer.features[TestFeature.Messages].balance;

		console.log(`📦 Final balance: ${finalBalance} (expected: 5)`);
		expect(finalBalance).to.equal(5, `Balance should remain 5, got ${finalBalance}`);
	});

	it("should allow tracking 7 units when PayPerUse balance is 5 (overage allowed)", async () => {
		const customer = await autumnInt.customers.get(payPerUseCustomerId);
		const balance = customer.features[TestFeature.Messages].balance;
		expect(balance).to.equal(5, `Balance should be 5, got ${balance}`);

		console.log("📊 Customer feature details:", JSON.stringify(customer.features[TestFeature.Messages], null, 2));

		// Get initial invoice count
		const initialInvoices = await stripeCli.invoices.list({
			customer: customer.stripe_id as string,
		});
		const initialInvoiceCount = initialInvoices.data.length;

		console.log("🚀 Tracking 7 units with PayPerUse balance of 5 (overage allowed)...");

		let error: any = null;
		let response: any = null;
		try {
			response = await autumnInt.track({
				customer_id: payPerUseCustomerId,
				feature_id: TestFeature.Messages,
				value: 7,
			});
		} catch (e) {
			error = e;
		}

		expect(error).to.be.null;
		expect(response).to.exist;
		console.log("✅ Request succeeded:", JSON.stringify(response));

		// Wait for processing (even though it should be synchronous with the PR changes)
		await new Promise(resolve => setTimeout(resolve, 3000));

		// Verify balance went negative (overage)
		const finalCustomer = await autumnInt.customers.get(payPerUseCustomerId);
		const finalBalance = finalCustomer.features[TestFeature.Messages].balance;
		const finalUsage = finalCustomer.features[TestFeature.Messages].usage;

		console.log(`📦 Final balance: ${finalBalance} (expected: -2)`);
		console.log(`📦 Final usage: ${finalUsage} (expected: 7)`);

		expect(finalBalance).to.equal(-2, `Balance should be -2 (5 included - 7 used), got ${finalBalance}`);
		expect(finalUsage).to.equal(7, `Usage should be 7, got ${finalUsage}`);

		// Note: Invoices may be created async or on billing cycle
		// For now, we just log the invoice count
		const finalInvoices = await stripeCli.invoices.list({
			customer: customer.stripe_id as string,
		});
		const finalInvoiceCount = finalInvoices.data.length;
		const newInvoicesCreated = finalInvoiceCount - initialInvoiceCount;

		console.log(`💳 Invoices: ${newInvoicesCreated} new invoice(s) created (may be 0 if invoiced later)`);

		if (newInvoicesCreated > 0) {
			const latestInvoice = finalInvoices.data[0];
			console.log(`   Invoice total: $${(latestInvoice.total / 100).toFixed(2)} (expected: 2 units × $0.01 = $0.02)`);
		}
	});
});

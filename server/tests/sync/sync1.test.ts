import { ApiVersion, ProductItemFeatureType, type Organization } from "@autumn/shared";
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

const testCase = "sync1";
const customerId = `${testCase}_cus1`;

const pro = constructProduct({
    id: "pro",
    items: [constructFeatureItem({ featureId: TestFeature.Messages, includedUsage: 5, featureType: ProductItemFeatureType.SingleUse })],
    type: "pro",
})

describe(`${chalk.yellowBright(`sync/${testCase}: Testing sync track consumable usage`)}`, () => {
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
			await (autumnInt as AutumnInt).customers.delete(customerId);
		} catch (_) {}

        await addPrefixToProducts({
            products: [pro],
            prefix: testCase,
        })

        await createProducts({
            autumn: autumnInt,
            products: [pro],
            customerId,
            db,
            orgId: org.id,
            env,
        })
	});

	it("should create a customer and issue balances", async () => {
        const { customer } = await initCustomerV2({
            autumn: autumnInt,
            customerId,
            org,
            env,
            db,
            attachPm: "success",
        })
		expect(customer).to.exist;
		expect(customer.id).to.equal(customerId);
		expect(customer.name).to.equal(customerId);
		expect(customer.email).to.equal(`${customerId}@example.com`);

        await autumnJs.attach({
            customer_id: customerId,
            product_id: pro.id,
        })
	});

	it("should only allow one 10x send with a 5x balance", async () => {
		const customer = await autumnInt.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		expect(balance).to.equal(5, `Balance should be 5, got ${balance} | Balances: ${JSON.stringify(customer.features)}`);

		const promises = [
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			}),
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			}),
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			}),
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			}),
			autumnInt.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			}),
		];

		let rejections = await Promise.allSettled(promises);

        expect(rejections.every(r => r.status === "rejected")).to.equal(true, `${rejections.map(r => r.status).join(", ")} <- all must be rejected`);

		const { data: balances, error } = await autumnJs.customers.get(
			customerId,
		);
		expect(error).to.be.null;
		expect(balances?.features[TestFeature.Messages]?.balance).to.equal(
			5,
			`Balance should be 10, got ${balances?.features[TestFeature.Messages]?.balance}`,
		);
	});
});

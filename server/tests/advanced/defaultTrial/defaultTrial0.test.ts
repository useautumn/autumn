import { APIVersion, ProductItemInterval, FreeTrialDuration } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { Organization, AppEnv } from "@autumn/shared";
import { Stripe } from "stripe";
import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { expect } from "chai";
import { flipDefaultState, flipDefaultStates, manuallyAttachDefaultTrial } from "tests/utils/testAttachUtils/trialAttachUtils.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";

const testCase = "defaultTrial0";

export let pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 1500,
			interval: ProductItemInterval.Month,
		}),
	],
    // id: testCase + "_pro",
	isDefault: true,
	forcePaidDefault: true,
	type: "pro",
	freeTrial: {
		length: 7,
		duration: FreeTrialDuration.Day,
		unique_fingerprint: false,
		card_required: false,
	},
});

export let free = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 500,
			interval: ProductItemInterval.Month,
		}),
	],
	type: "free",
	isDefault: true,
});

const cleanUpCustomers = async (autumn: AutumnInt) => {
    [testCase + "_a", testCase + "_b"].forEach(async (customerId) => {
        await autumn.customers.delete(customerId).catch(e => {
            throw e;
        });
    });
}

describe(`${chalk.yellowBright(`advanced/${testCase}: ensure manually attaching is the same as creating a customer`)}`, () => {

    let customerId_a = testCase + "_a";
    let customerId_b = testCase + "_b";
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;
    let autumn_js: any;

    let curUnix = Math.floor(new Date().getTime() / 1000);

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;
        stripeCli = this.stripeCli;
        autumn_js = this.autumnJs;

    
		let productsToCreate = addPrefixToProducts({
			products: [pro, free],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: productsToCreate,
			db,
			orgId: org.id,
			env,
		}).catch(e => {
            if(e.message.includes("already exists")) {
                return;
            }
            throw e;
        });

        await flipDefaultStates({
            currentCase: 0,
            autumn,
        });

        await cleanUpCustomers(autumn);
    });

    it("should match initCustomer", async function () {
        before(async function () {
            await autumn.customers.delete(customerId_a);
            await autumn.customers.delete(customerId_b);
        });

        await manuallyAttachDefaultTrial({
            customerId: customerId_a,
            stripeCli,
            autumn,
            db,
            org,
            env,
            autumnJs: autumn_js,
            group: testCase,
        });

        let customer_a = await autumn.customers.get(customerId_a);

        expect(customer_a, "customer should be defined").to.exist;

        let customer_a_products = customer_a?.products.map(p => p.id + " " + p.status + " " + p.name);

        expect(customer_a_products[0], "customer_a_products should be defined").to.exist;

        await initCustomer({
            customerId: customerId_b,
            autumn: autumn_js,
            db,
            org,
            env,
        });

        let customer_b = await autumn.customers.get(customerId_b);

        let customer_b_products = customer_b?.products.map((p: any) => p.id + " " + p.status + " " + p.name);

        expect(customer_b_products[0], "customer_b_products should be defined").to.exist;

        expect(customer_a_products[0], "customer_a_products should be the same as customer_b_products").to.equal(customer_b_products[0]);
    });

    after(async function() {
        await cleanUpCustomers(autumn);
    });
})

import { AutumnInt } from "@/external/autumn/autumnCli.js";
// Manual customer creation - not using initCustomer to control test clock properly
import {
	APIVersion,
	AppEnv,
	CusProductStatus,
	FreeTrialDuration,
	Organization,
	ProductItemInterval,
} from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "tests/attach/utils.js";
import {
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { flipDefaultState, flipDefaultStates, manuallyAttachDefaultTrial } from "tests/utils/testAttachUtils/trialAttachUtils.js";
import { expect } from "chai";

// Case 1: ✅
// Pro product with default trial exists alongside a free default product
// Or a pro product with default trial exists alone
// -> Creating a new customer should attach the pro product with default trial

// Case 3:
// Pro product with default trial exists alone
// -> Creating a new customer should attach the pro product with default trial

const testCase = "defaultTrial1";

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


describe(`${chalk.yellowBright(`advanced/${testCase}: ensure default trials are attached when creating a customer`)}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockID: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

    let curUnix = Math.floor(new Date().getTime() / 1000);

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;
        let testClock = await stripeCli.testHelpers.testClocks.create({
            frozen_time: curUnix,
        });
        testClockID = testClock.id;

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
            currentCase: 1,
            autumn,
        });

        let customer = await manuallyAttachDefaultTrial({
			customerId,
			stripeCli,
			autumn,
			db,
			org,
			env,
			testClockID,
			autumnJs,
			group: testCase,
		});

        expect(customer, "customer should be defined").to.exist;    
    });

    it("should create a customer with the paid default trial", async function () {
        let customer = await autumn.customers.get(customerId);

        expectProductAttached({
            customer,
            product: pro,
        });
    });

    describe("ensure trials automatically cancel if no payment method is provided", () => {
        it("should expire after 7 days", async function () {
            await advanceTestClock({
                stripeCli,
                testClockId: testClockID,
                numberOfDays: 8,
                waitForSeconds: 10,
            });
    
            let customer = await autumn.customers.get(customerId);
    
            expectProductAttached({
                customer,
                product: free,
                status: CusProductStatus.Active
            });
        });
    });
});

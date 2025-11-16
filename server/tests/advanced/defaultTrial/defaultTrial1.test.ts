// Manual customer creation - not using initCustomer to control test clock properly
import { beforeAll, describe, it } from "bun:test";
import {
	CusProductStatus,
	FreeTrialDuration,
	LegacyVersion,
	ProductItemInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// Case 1: ✅
// Pro product with default trial exists alongside a free default product
// Or a pro product with default trial exists alone
// -> Creating a new customer should attach the pro product with default trial

// Case 3:
// Pro product with default trial exists alone
// -> Creating a new customer should attach the pro product with default trial

const defaultTrialPro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 1500,
			interval: ProductItemInterval.Month,
		}),
	],
	isDefault: true,
	forcePaidDefault: true,
	id: "defaultTrial_pro",
	group: "defaultTrial",
	type: "pro",
	freeTrial: {
		length: 7,
		duration: FreeTrialDuration.Day,
		unique_fingerprint: false,
		card_required: false,
	},
});

const defaultTrialFree = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 500,
			interval: ProductItemInterval.Month,
		}),
	],
	id: "defaultTrial_free",
	group: "defaultTrial",
	type: "free",
	isDefault: true,
});

const testCase = "defaultTrial1";

describe(`${chalk.yellowBright(`advanced/${testCase}: ensure default trials are attached when creating a customer`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockID: string;
	let stripeCli: Stripe;

	beforeAll(async () => {
		// Products must be initialized BEFORE customer creation for default products
		await initProductsV0({
			ctx,
			products: [defaultTrialPro, defaultTrialFree],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
		});

		testClockID = res.testClockId;
		stripeCli = ctx.stripeCli;
	});

	it("should create a customer with the paid default trial", async () => {
		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: defaultTrialPro,
			status: CusProductStatus.Trialing,
		});
	});

	describe("ensure trials automatically cancel if no payment method is provided", () => {
		it("should expire after 7 days", async () => {
			await advanceTestClock({
				stripeCli,
				testClockId: testClockID,
				numberOfDays: 8,
				waitForSeconds: 10,
			});

			const customer = await autumn.customers.get(customerId);

			expectProductAttached({
				customer,
				product: defaultTrialFree,
				status: CusProductStatus.Active,
			});
		});
	});
});

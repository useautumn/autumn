// Manual customer creation - not using initCustomer to control test clock properly
import { beforeAll, describe, it } from "bun:test";
import {
	CusProductStatus,
	FreeTrialDuration,
	LegacyVersion,
	ProductItemInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addDays, addHours } from "date-fns";
import type Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// 2.2:
// -> Creating a new customer with a payment method should attach the pro product with default trial
// --> Advancing the test clock should cancel the trial and attach the pro product

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

const testCase = "defaultTrial2";

describe(`${chalk.yellowBright(`advanced/${testCase}: ensure trial transitions into full product if payment method is valid`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockID: string;
	let stripeCli: Stripe;

	beforeAll(async () => {
		// Products must be initialized BEFORE customer creation for default products
		await initProductsV0({
			ctx,
			products: [defaultTrialPro],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
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
		});
	});

	it("should be active after 7 days", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId: testClockID,
			advanceTo: addHours(
				addDays(new Date(), 7),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 10,
		});

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: defaultTrialPro,
			status: CusProductStatus.Active,
		});
	});
});

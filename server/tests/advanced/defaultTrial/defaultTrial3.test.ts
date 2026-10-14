import { beforeAll, describe, expect, it } from "bun:test";
import {
	FreeTrialDuration,
	LegacyVersion,
	ProductItemInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import {
	expectProductAttached,
	expectProductNotAttached,
} from "@tests/utils/expectUtils/expectProductAttached.js";
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
	type: "pro",
	freeTrial: {
		length: 7,
		duration: FreeTrialDuration.Day,
		unique_fingerprint: false,
		card_required: false,
	},
});

const testCase = "defaultTrial3";

describe(`${chalk.yellowBright(`advanced/${testCase}: ensure trials cancel with bad payment method`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockID: string;
	let stripeCli: Stripe;
	let stripeCustomerId: string;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [defaultTrialPro],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			attachPm: "fail",
			withTestClock: true,
			withDefault: true,
		});

		testClockID = res.testClockId;
		stripeCli = ctx.stripeCli;
		stripeCustomerId = res.customer.processor?.id ?? "";
		expect(stripeCustomerId).toBeTruthy();
	});

	it("should create a customer with the paid default trial", async () => {
		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: defaultTrialPro,
		});
	});

	it("should cancel after 7 days", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId: testClockID,
			advanceTo: addHours(
				addDays(new Date(), 7),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		const customer = await autumn.customers.get(customerId);

		expectProductNotAttached({ customer, product: defaultTrialPro });
		const { data: subscriptions } = await stripeCli.subscriptions.list({
			customer: stripeCustomerId,
			status: "all",
		});
		expect(subscriptions).toHaveLength(0);
	});
});

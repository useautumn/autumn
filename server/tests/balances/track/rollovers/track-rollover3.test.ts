import { beforeAll, describe, test } from "bun:test";
import {
	ApiVersion,
	LegacyVersion,
	type LimitedItem,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const rolloverConfig = {
	max: 500,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};
const messagesItem = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 400,
	rolloverConfig,
}) as LimitedItem;

export const pro = constructProduct({
	items: [messagesItem],
	type: "pro",
	isDefault: false,
});

const testCase = "track-rollover3";

describe(`${chalk.yellowBright(`${testCase}: Testing rollovers for usage price feature`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	// v1_4 responses carry `features`, not `balances` — balance assertions read
	// through a V2 client.
	const autumnV2_1 = new AutumnInt({ version: ApiVersion.V2_1 });
	let testClockId: string;
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = res.testClockId!;
	});

	test("should attach pro product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	const rollover = 250;

	test("should create track messages, reset, and have correct rollover", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesItem.included_usage - rollover,
		});

		// The deduction must have landed in Postgres before the cycle rolls,
		// otherwise the reset rolls over the full (undeducted) balance.
		await expectBalanceCorrect({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			remaining: rollover,
			skipCache: true,
		});

		await advanceToNextInvoice({
			stripeCli,
			testClockId,
			withPause: true,
		});

		const expectedBalance = messagesItem.included_usage + rollover;

		await expectBalanceCorrect({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			remaining: expectedBalance,
			rollovers: [{ balance: rollover }],
		});

		// Verify non-cached customer balance
		await expectBalanceCorrect({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			remaining: expectedBalance,
			rollovers: [{ balance: rollover }],
			skipCache: true,
		});
	});
});

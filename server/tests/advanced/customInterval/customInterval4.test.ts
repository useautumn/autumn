import { LegacyVersion } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { addMonths } from "date-fns";
import type Stripe from "stripe";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import {
	expectDowngradeCorrect,
	expectNextCycleCorrect,
} from "tests/utils/expectUtils/expectScheduleUtils.js";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "customInterval4";

export const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 500,
		}),
	],
	intervalCount: 2,
	type: "pro",
});

export const premium = constructProduct({
	id: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 500,
		}),
	],
	intervalCount: 2,
	type: "premium",
});

describe(`${chalk.yellowBright(`${testCase}: Testing downgrades for custom intervals`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: testCase,
			customerId,
		});

		testClockId = testClockId1!;
	});

	test("should attach premium product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});

	test("should have correct next cycle at on checkout", async () => {
		const checkout = await autumn.checkout({
			customer_id: customerId,
			product_id: pro.id,
		});

		const expectedNextCycle = addMonths(new Date(), 2);
		expect(checkout.next_cycle?.starts_at).toBeCloseTo(
			expectedNextCycle.getTime(),
			-Math.log10(1000 * 60 * 60 * 24),
		);

		expect(checkout.total).toBe(0);
	});

	let preview: any;
	test("should downgrade to pro", async () => {
		const { preview: preview_ } = await expectDowngradeCorrect({
			autumn,
			customerId,
			curProduct: premium,
			newProduct: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});

		preview = preview_;
	});

	test("should have pro attached on next cycle", async () => {
		await expectNextCycleCorrect({
			preview: preview!,
			autumn,
			stripeCli: ctx.stripeCli,
			customerId,
			testClockId,
			product: pro,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).toBe(2);
		expect(invoices[0].total).toBe(getBasePrice({ product: pro }));
	});
});

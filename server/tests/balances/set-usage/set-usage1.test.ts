import { beforeAll, describe, expect, test } from "bun:test";
import { OnDecrease, OnIncrease, ProductItemFeatureType } from "@autumn/shared";
import { defaultApiVersion } from "@tests/constants.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { getSubsFromCusId } from "@tests/utils/expectUtils/expectSubUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import chalk from "chalk";
import { addDays, addHours } from "date-fns";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const seatsItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	featureType: ProductItemFeatureType.ContinuousUse,
	pricePerUnit: 20,
	includedUsage: 3,
	config: {
		on_increase: OnIncrease.ProrateNextCycle,
		on_decrease: OnDecrease.ProrateNextCycle,
	},
});

const seatsProduct = constructProduct({
	type: "pro",
	items: [seatsItem],
});

const testCase = "set-usage1";
const includedUsage = seatsItem.included_usage as number;

const simulateOneCycle = async ({
	customerId,
	stripeCli,
	curUnix,
	usageValues,
	autumn,
	testClockId,
}: {
	customerId: string;
	stripeCli: Stripe;
	curUnix: number;
	usageValues: number[];
	autumn: AutumnInt;
	testClockId: string;
}) => {
	const { subs } = await getSubsFromCusId({
		customerId,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		stripeCli,
		productId: seatsProduct.id,
	});

	const sub = subs[0];

	let accruedPrice = 0;
	for (const usageValue of usageValues) {
		const daysToAdvance = Math.round(Math.random() * 10) + 1;
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addDays(curUnix, daysToAdvance).getTime(),
			waitForSeconds: 10,
		});

		const customer = await autumn.customers.get(customerId);
		const prevBalance = customer.features[TestFeature.Users].balance!;
		const prevUsage = includedUsage - prevBalance;

		const usageDiff = usageValue - prevUsage;

		const value1 = Math.floor(usageDiff / 2);
		const value2 = usageDiff - value1;

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: value1,
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: value2,
		});

		const newBalance = includedUsage - usageValue;
		const prevOverage = Math.max(0, -prevBalance);
		const newOverage = Math.max(0, -newBalance);

		const newPrice = (newOverage - prevOverage) * seatsItem.price!;

		const { start, end } = subToPeriodStartEnd({ sub });
		const proratedPrice = calculateProrationAmount({
			periodStart: start * 1000,
			periodEnd: end * 1000,
			now: curUnix,
			amount: newPrice,
			allowNegative: true,
		});

		accruedPrice = new Decimal(accruedPrice).plus(proratedPrice).toNumber();
	}

	const customer = await autumn.customers.get(customerId);
	const balance = customer.features[TestFeature.Users].balance!;

	const overage = Math.min(0, includedUsage - balance);
	const usagePrice = overage * seatsItem.price!;
	const basePrice = getBasePrice({ product: seatsProduct });

	const totalPrice = new Decimal(accruedPrice)
		.plus(usagePrice)
		.plus(basePrice)
		.toDecimalPlaces(2)
		.toNumber();

	const { end } = subToPeriodStartEnd({ sub });
	curUnix = await advanceTestClock({
		stripeCli,
		testClockId,
		advanceTo: addHours(end * 1000, hoursToFinalizeInvoice).getTime(),
		waitForSeconds: 30,
	});

	const cusAfter = await autumn.customers.get(customerId);
	const invoices = cusAfter.invoices;
	const invoice = invoices[0];

	expect(invoice.total).toBeLessThanOrEqual(totalPrice + 0.01);
	expect(invoice.total).toBeGreaterThanOrEqual(totalPrice - 0.01);

	return {
		curUnix,
	};
};

describe(`${chalk.yellowBright(`${testCase}: Testing update cont use through /usage`)}`, () => {
	const customerId = testCase;
	let testClockId = "";
	const autumn = new AutumnInt({ version: defaultApiVersion });
	let curUnix = Date.now();

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [seatsProduct],
			prefix: testCase,
			customerId,
		});

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = testClockId1!;
	});

	test("should attach in arrear prorated seats", async () => {
		await attachAndExpectCorrect({
			customerId,
			product: seatsProduct,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			autumn,
			stripeCli: ctx.stripeCli,
		});
	});

	test("simulate first cycle and have correct invoice / balance", async () => {
		const res = await simulateOneCycle({
			customerId,
			stripeCli: ctx.stripeCli,
			curUnix,
			usageValues: [8, 2],
			autumn,
			testClockId,
		});

		curUnix = res.curUnix;
	});

	test("simulate second cycle and have correct invoice / balance", async () => {
		const res = await simulateOneCycle({
			customerId,
			stripeCli: ctx.stripeCli,
			curUnix,
			usageValues: [12, 3],
			autumn,
			testClockId,
		});

		curUnix = res.curUnix;
	});
});

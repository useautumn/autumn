import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	OnDecrease,
	OnIncrease,
	ProductItemFeatureType,
} from "@autumn/shared";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration/calculateProratedDiff.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { expectSubQuantityCorrect } from "@tests/utils/expectUtils/expectContUseUtils.js";
import { getSubsFromCusId } from "@tests/utils/expectUtils/expectSubUtils.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import chalk from "chalk";
import { addDays, addHours, addWeeks } from "date-fns";
import { Decimal } from "decimal.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

// =============================================================================
// MIGRATED FROM: set-usage1.test.ts
// Tests /usage endpoint with arrear prorated seats (ProrateNextCycle)
// Simulates full billing cycles with random clock advances and verifies invoices
// =============================================================================

test.concurrent(`${chalk.yellowBright("legacy-set-usage1: proration cycle simulation with /usage")}`, async () => {
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

	const includedUsage = seatsItem.included_usage as number;

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "legacy-set-usage1",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [seatsProduct] }),
		],
		actions: [s.attach({ productId: seatsProduct.id })],
	});

	// --- Helper: simulate one billing cycle ---
	const simulateOneCycle = async ({
		curUnix,
		usageValues,
	}: {
		curUnix: number;
		usageValues: number[];
	}) => {
		const { subs } = await getSubsFromCusId({
			customerId,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			stripeCli: ctx.stripeCli,
			productId: seatsProduct.id,
		});

		const sub = subs[0];

		let accruedPrice = 0;
		for (const usageValue of usageValues) {
			const daysToAdvance = Math.round(Math.random() * 10) + 1;
			curUnix = await advanceTestClock({
				stripeCli: ctx.stripeCli,
				testClockId: testClockId!,
				advanceTo: addDays(curUnix, daysToAdvance).getTime(),
				waitForSeconds: 10,
			});

			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			const prevBalance = customer.features[TestFeature.Users].balance!;

			await autumnV1.usage({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: usageValue,
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

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
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
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: addHours(end * 1000, hoursToFinalizeInvoice).getTime(),
			waitForSeconds: 30,
		});

		const cusAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const invoices = cusAfter.invoices!;
		const invoice = invoices[0];

		expect(invoice.total).toBeLessThanOrEqual(
			new Decimal(totalPrice).plus(0.01).toNumber(),
		);
		expect(invoice.total).toBeGreaterThanOrEqual(
			new Decimal(totalPrice).minus(0.01).toNumber(),
		);

		return { curUnix };
	};

	// Cycle 1: usage fluctuates [8, 2]
	const { curUnix } = await simulateOneCycle({
		curUnix: Date.now(),
		usageValues: [8, 2],
	});

	// Cycle 2: usage fluctuates [12, 3]
	await simulateOneCycle({
		curUnix,
		usageValues: [12, 3],
	});
}); // Longer timeout for Stripe test clock operations

// =============================================================================
// MIGRATED FROM: set-usage2.test.ts
// Tests /usage endpoint for cont use with ProrateNextCycle behavior
// Verifies subscription quantity sync and upcoming invoice items
// =============================================================================

test.concurrent(`${chalk.yellowBright("legacy-set-usage2: ProrateNextCycle sub quantity and upcoming items")}`, async () => {
	const userItem = constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: 50,
		includedUsage: 1,
		config: {
			on_increase: OnIncrease.ProrateNextCycle,
			on_decrease: OnDecrease.ProrateNextCycle,
		},
	});

	const pro = constructProduct({
		items: [userItem],
		type: "pro",
	});

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "legacy-set-usage2",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	let curUnix = Date.now();

	// Step 1: set usage to 3, advance 2 weeks
	curUnix = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addWeeks(curUnix, 2).getTime(),
		waitForSeconds: 15,
	});

	await autumnV1.usage({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 3,
	});

	await timeout(15000);

	const usage1 = 3;

	const { stripeSubs } = await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage: usage1,
	});

	const stripeCustomerId = stripeSubs[0].customer as string;

	// Step 1: overage went 0 → 2. Credit for $0 old is filtered; 1 deferred invoice item created.
	const proratedCharge1 = await calculateProratedDiff({
		customerId,
		advancedTo: curUnix,
		oldAmount: 0,
		newAmount: 2 * userItem.price!,
	});

	const items1 = await ctx.stripeCli.invoiceItems.list({
		customer: stripeCustomerId,
	});
	expect(items1.data.length).toBe(1);
	expect(
		Math.abs(items1.data[0].amount - Math.round(proratedCharge1 * 100)),
	).toBeLessThanOrEqual(1);

	const customer1 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer1.invoices!.length).toBe(1);

	// Step 2: set usage to 2, advance 1 week
	curUnix = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addWeeks(curUnix, 1).getTime(),
		waitForSeconds: 15,
	});

	await autumnV1.usage({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage: 2,
	});

	// Step 2: overage went 2 → 1. Two deferred items: credit for old (2 overage) + charge for new (1 overage).
	// Net of the 2 newest items = prorated diff from 2×$50 → 1×$50.
	const proratedDiff2 = await calculateProratedDiff({
		customerId,
		advancedTo: curUnix,
		oldAmount: 2 * userItem.price!,
		newAmount: 1 * userItem.price!,
	});

	const items2 = await ctx.stripeCli.invoiceItems.list({
		customer: stripeCustomerId,
	});
	expect(items2.data.length).toBe(3);

	const netStep2Cents = items2.data[0].amount + items2.data[1].amount;
	expect(
		Math.abs(netStep2Cents - Math.round(proratedDiff2 * 100)),
	).toBeLessThanOrEqual(1);

	const customer2 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer2.invoices!.length).toBe(1);

	// Step 3: set usage to 4, no clock advance
	await autumnV1.usage({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 4,
	});

	await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage: 4,
	});

	// Step 3: overage went 1 → 3. Two deferred items: credit for old (1 overage) + charge for new (3 overage).
	// Net of the 2 newest items = prorated diff from 1×$50 → 3×$50.
	const proratedDiff3 = await calculateProratedDiff({
		customerId,
		advancedTo: curUnix,
		oldAmount: 1 * userItem.price!,
		newAmount: 3 * userItem.price!,
	});

	const items3 = await ctx.stripeCli.invoiceItems.list({
		customer: stripeCustomerId,
	});
	expect(items3.data.length).toBe(5);

	const netStep3Cents = items3.data[0].amount + items3.data[1].amount;
	expect(
		Math.abs(netStep3Cents - Math.round(proratedDiff3 * 100)),
	).toBeLessThanOrEqual(1);

	const customer3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer3.invoices!.length).toBe(1);
}); // Longer timeout for Stripe test clock operations

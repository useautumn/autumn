import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	OnDecrease,
	OnIncrease,
	ProductItemFeatureType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import {
	expectSubQuantityCorrect,
	expectUpcomingItemsCorrect,
} from "@tests/utils/expectUtils/expectContUseUtils.js";
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

	let usage = 3;

	const { stripeSubs, fullCus } = await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage,
	});

	await expectUpcomingItemsCorrect({
		stripeCli: ctx.stripeCli,
		fullCus,
		stripeSubs,
		curUnix,
		expectedNumItems: 1,
		unitPrice: userItem.price!,
		quantity: 2, // 3 usage - 1 included = 2 overage
	});

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

	const result2 = await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage: 2,
	});

	await expectUpcomingItemsCorrect({
		stripeCli: ctx.stripeCli,
		fullCus: result2.fullCus,
		stripeSubs: result2.stripeSubs,
		unitPrice: userItem.price!,
		curUnix,
		expectedNumItems: 2,
		quantity: -1, // decrease by 1 seat
	});

	const customer2 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer2.invoices!.length).toBe(1);

	// Step 3: set usage to 4, no clock advance
	await autumnV1.usage({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 4,
	});

	usage = 4;

	const result3 = await expectSubQuantityCorrect({
		stripeCli: ctx.stripeCli,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
		usage,
	});

	await expectUpcomingItemsCorrect({
		stripeCli: ctx.stripeCli,
		fullCus: result3.fullCus,
		stripeSubs: result3.stripeSubs,
		unitPrice: userItem.price!,
		curUnix,
		expectedNumItems: 3,
		quantity: 2, // +2 seats from usage=2 to usage=4
	});

	const customer3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer3.invoices!.length).toBe(1);
}, 300_000); // Longer timeout for Stripe test clock operations

import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration/calculateProratedDiff.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectSubQuantityCorrect } from "@tests/utils/expectUtils/expectContUseUtils.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

// =============================================================================
// MIGRATED FROM: set-usage2.test.ts
// Tests /usage endpoint for cont use with ProrateNextCycle behavior
// Verifies subscription quantity sync and upcoming invoice items
// =============================================================================

// Known bug: a second allocated change in one period re-credits an already-refunded charge (storedLineItemUtils).
test.failing(
	`${chalk.yellowBright("legacy-set-usage2: ProrateNextCycle sub quantity and upcoming items")}`,
	async () => {
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
	},
); // Longer timeout for Stripe test clock operations

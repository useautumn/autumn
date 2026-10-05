// Regression: a customer charged for the wrong quarterly phase is corrected to a
// free current phase, then resumes quarterly billing in October with a reset anchor.

import { expect, test } from "bun:test";
import {
	BillingInterval,
	type CreateScheduleParamsV0Input,
	ms,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import globalCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import {
	expandedStripePrice,
	findSchedulePhase,
	findSchedulePhaseAt,
	newInvoices,
	previewCreateSchedule,
} from "./freeFirstPhaseUtils";

test.concurrent(
	`${chalk.yellowBright("create-schedule free current phase: resumes quarterly billing in October with reset anchor")}`,
	async () => {
		const customerId = "create-schedule-free-current-october-reset";
		const clockStart = Date.UTC(2027, 4, 2, 16, 49);
		const scheduleStartsAt = Date.UTC(2027, 5, 30, 13, 11);
		const badQuarterlyStartsAt = Date.UTC(2027, 6, 2, 16, 49);
		const postCorrectionPreviewAt = Date.UTC(2027, 6, 6, 12, 0);
		const noChargeCheckAt = Date.UTC(2027, 7, 2, 17, 0);
		const paidStartsAt = Date.UTC(2027, 9, 2, 12, 0);
		const freeStartsAt = Date.UTC(2028, 3, 2, 12, 0);
		const paidResumesAt = Date.UTC(2028, 6, 2, 12, 0);

		const testClock = await globalCtx.stripeCli.testHelpers.testClocks.create({
			frozen_time: Math.floor(clockStart / 1000),
		});

		const agencyMonthly = products.base({
			id: "agency-premium",
			items: [
				items.monthlyMessages({ includedUsage: 500 }),
				items.monthlyPrice({ price: 499 }),
			],
		});
		const rpsAddOn = products.base({
			id: "plus-5-rps",
			isAddOn: true,
			items: [items.monthlyMessages({ includedUsage: 5 })],
		});
		const commercialQuarterly = products.base({
			id: "commercial-quarterly",
			items: [
				items.monthlyMessages({ includedUsage: 500 }),
				constructPriceItem({
					price: 2000,
					interval: BillingInterval.Quarter,
				}),
			],
		});

		const { autumnV1, customer, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({
					testClock: false,
					paymentMethod: "success",
					stripeCustomerOverrides: { test_clock: testClock.id },
				}),
				s.products({
					list: [agencyMonthly, rpsAddOn, commercialQuarterly],
				}),
			],
			actions: [s.billing.attach({ productId: agencyMonthly.id })],
		});
		const freeCommercialPlan = {
			plan_id: commercialQuarterly.id,
			customize: { price: null },
		};

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClock.id,
			advanceTo: scheduleStartsAt,
			waitForSeconds: 30,
		});

		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: scheduleStartsAt,
					plans: [{ plan_id: agencyMonthly.id }, { plan_id: rpsAddOn.id }],
				},
				{
					starts_at: badQuarterlyStartsAt,
					plans: [{ plan_id: commercialQuarterly.id }],
				},
				{
					starts_at: freeStartsAt,
					plans: [freeCommercialPlan],
				},
				{
					starts_at: paidResumesAt,
					plans: [{ plan_id: commercialQuarterly.id }],
				},
			],
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClock.id,
			advanceTo: badQuarterlyStartsAt,
			waitForSeconds: 30,
		});

		const stripeCustomerId = customer.processor?.id;
		expect(stripeCustomerId).toBeDefined();
		const invoicesAfterBadCharge = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId!,
			limit: 20,
		});
		expect(
			invoicesAfterBadCharge.data.some((invoice) => invoice.total === 67391),
		).toBe(true);

		const correctedScheduleParams = {
			customer_id: customerId,
			billing_behavior: "none",
			phases: [
				{
					starts_at: scheduleStartsAt,
					plans: [{ plan_id: agencyMonthly.id }, { plan_id: rpsAddOn.id }],
				},
				{
					starts_at: badQuarterlyStartsAt,
					plans: [freeCommercialPlan],
				},
				{
					starts_at: paidStartsAt,
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: commercialQuarterly.id }],
				},
				{
					starts_at: freeStartsAt,
					plans: [freeCommercialPlan],
				},
				{
					starts_at: paidResumesAt,
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: commercialQuarterly.id }],
				},
			],
		} satisfies CreateScheduleParamsV0Input;

		await autumnV1.billing.createSchedule(correctedScheduleParams);

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClock.id,
			advanceTo: postCorrectionPreviewAt,
			waitForSeconds: 30,
		});

		await previewCreateSchedule({
			autumnV1,
			params: correctedScheduleParams,
		});

		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId!,
			status: "all",
			limit: 10,
			expand: ["data.schedule"],
		});
		const subscription = subscriptions.data.find((sub) => sub.schedule);
		expect(subscription).toBeDefined();
		const stripeScheduleId =
			typeof subscription?.schedule === "string"
				? subscription.schedule
				: subscription?.schedule?.id;
		expect(stripeScheduleId).toBeDefined();

		const schedule = await ctx.stripeCli.subscriptionSchedules.retrieve(
			stripeScheduleId!,
			{ expand: ["phases.items.price"] },
		);
		const currentFreePhase = findSchedulePhaseAt({
			schedule,
			timestamp: badQuarterlyStartsAt,
		});
		expect(currentFreePhase).toBeDefined();
		const hasPaidCurrentItem = currentFreePhase!.items.some(
			(item) => (expandedStripePrice(item.price)?.unit_amount ?? 0) > 0,
		);
		expect(hasPaidCurrentItem).toBe(false);

		const currentSubscription = await ctx.stripeCli.subscriptions.retrieve(
			subscription!.id,
			{ expand: ["items.data.price"] },
		);
		expect(
			currentSubscription.items.data.every(
				(item) => item.price.unit_amount === 0,
			),
		).toBe(true);

		const octoberPaidPhase = findSchedulePhase({
			schedule,
			startsAt: paidStartsAt,
		});
		expect(octoberPaidPhase?.billing_cycle_anchor).toBe("phase_start");
		const julyPaidPhase = findSchedulePhase({
			schedule,
			startsAt: paidResumesAt,
		});
		expect(julyPaidPhase?.billing_cycle_anchor).toBe("phase_start");

		const invoiceIdsBeforeAugust = new Set(
			invoicesAfterBadCharge.data.map((invoice) => invoice.id),
		);
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClock.id,
			advanceTo: noChargeCheckAt,
			waitForSeconds: 30,
		});
		const invoicesAfterAugust = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId!,
			limit: 20,
		});
		const augustInvoices = newInvoices({
			beforeIds: invoiceIdsBeforeAugust,
			invoices: invoicesAfterAugust.data,
		});
		expect(augustInvoices.every((invoice) => invoice.total === 0)).toBe(true);

		const invoiceIdsBeforeOctober = new Set(
			invoicesAfterAugust.data.map((invoice) => invoice.id),
		);
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClock.id,
			advanceTo: paidStartsAt,
			waitForSeconds: 30,
		});
		const invoicesAfterOctober = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId!,
			limit: 20,
		});
		const octoberPaidInvoices = newInvoices({
			beforeIds: invoiceIdsBeforeOctober,
			invoices: invoicesAfterOctober.data,
		}).filter((invoice) => invoice.total > 0);
		expect(octoberPaidInvoices.map((invoice) => invoice.total)).toEqual([
			200000,
		]);

		const paidSubscription = await ctx.stripeCli.subscriptions.retrieve(
			subscription!.id,
			{ expand: ["items.data.price"] },
		);
		const subscriptionItem = paidSubscription.items.data[0];
		expect(subscriptionItem).toBeDefined();
		expect(
			Math.abs(subscriptionItem!.current_period_start * 1000 - paidStartsAt),
		).toBeLessThan(ms.minutes(1));
		expect(
			Math.abs(
				subscriptionItem!.current_period_end * 1000 -
					Date.UTC(2028, 0, 2, 12, 0),
			),
		).toBeLessThan(ms.minutes(1));
		const stripePrice = subscriptionItem?.price;
		expect(stripePrice?.recurring?.interval).toBe("month");
		expect(stripePrice?.recurring?.interval_count).toBe(3);
	},
	// Five test-clock advances with 30s settles take ~255s alone on twd, too
	// close to the 300s default.
	{ timeout: 420_000 },
);

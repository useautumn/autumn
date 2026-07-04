// Regression: active subscriptions can be corrected with a prepaid/free first
// phase, then resume paid billing on a future phase.

import { expect, test } from "bun:test";
import {
	BillingInterval,
	CusProductStatus,
	customerProducts,
	ms,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import globalCtx from "@tests/utils/testInitUtils/createTestContext";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { addMonths } from "date-fns";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import chalk from "chalk";

const findSchedulePhase = ({
	schedule,
	startsAt,
}: {
	schedule: Stripe.SubscriptionSchedule;
	startsAt: number;
}) =>
	schedule.phases.find(
		(phase) => Math.abs(phase.start_date * 1000 - startsAt) < ms.minutes(1),
	);

const findSchedulePhaseAt = ({
	schedule,
	timestamp,
}: {
	schedule: Stripe.SubscriptionSchedule;
	timestamp: number;
}) =>
	schedule.phases.find(
		(phase) =>
			phase.start_date * 1000 <= timestamp &&
			(!phase.end_date || phase.end_date * 1000 > timestamp),
	);

const expandedStripePrice = (
	price: Stripe.SubscriptionSchedule.Phase.Item["price"] | undefined,
) => (price && typeof price !== "string" && !("deleted" in price) ? price : undefined);

const newInvoices = ({
	beforeIds,
	invoices,
}: {
	beforeIds: Set<string>;
	invoices: Stripe.Invoice[];
}) => invoices.filter((invoice) => !beforeIds.has(invoice.id));

test.concurrent(
	`${chalk.yellowBright("create-schedule free first phase: active subscription resumes paid future phase")}`,
	async () => {
		const customerId = "create-schedule-free-first-active-sub";
		const paid = products.base({
			id: "commercial-quarterly",
			items: [
				items.monthlyMessages({ includedUsage: 500 }),
				constructPriceItem({
					price: 2000,
					interval: BillingInterval.Quarter,
				}),
			],
		});
		const free = products.base({
			id: "commercial-free-access",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [paid, free] }),
			],
			actions: [s.billing.attach({ productId: paid.id })],
		});

		const [paidBefore] = await ctx.db
			.select()
			.from(customerProducts)
			.where(
				and(
					eq(customerProducts.customer_id, customerId),
					eq(customerProducts.product_id, paid.id),
					eq(customerProducts.status, CusProductStatus.Active),
				),
			);
		const stripeSubscriptionId = paidBefore?.subscription_ids?.[0];
		expect(stripeSubscriptionId).toBeDefined();

		const paidPhaseStartsAt = addMonths(advancedTo, 3).getTime();
		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			billing_behavior: "none",
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: free.id }],
				},
				{
					starts_at: paidPhaseStartsAt,
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: paid.id }],
				},
			],
		});

		const freeCustomerProductId = response.phases[0]?.customer_product_ids[0];
		expect(freeCustomerProductId).toBeDefined();
		const [freeCustomerProduct] = await ctx.db
			.select()
			.from(customerProducts)
			.where(eq(customerProducts.id, freeCustomerProductId!));
		expect(freeCustomerProduct?.status).toBe(CusProductStatus.Active);
		expect(freeCustomerProduct?.ended_at).toBe(response.phases[1]?.starts_at);

		const subscription = await ctx.stripeCli.subscriptions.retrieve(
			stripeSubscriptionId!,
		);
		const stripeScheduleId =
			typeof subscription.schedule === "string"
				? subscription.schedule
				: subscription.schedule?.id;
		expect(stripeScheduleId).toBeDefined();

		const schedule = await ctx.stripeCli.subscriptionSchedules.retrieve(
			stripeScheduleId!,
			{ expand: ["phases.items.price"] },
		);
		const freeStripePhase = findSchedulePhase({
			schedule,
			startsAt: response.phases[0]!.starts_at,
		});
		expect(freeStripePhase).toBeDefined();
		const freePrice = expandedStripePrice(freeStripePhase?.items[0]?.price);
		expect(freePrice?.unit_amount).toBe(0);

		const paidStripePhase = findSchedulePhase({
			schedule,
			startsAt: response.phases[1]!.starts_at,
		});
		expect(paidStripePhase?.billing_cycle_anchor).toBe("phase_start");
		const paidPrice = expandedStripePrice(paidStripePhase?.items[0]?.price);
		expect(paidPrice?.recurring?.interval).toBe("month");
		expect(paidPrice?.recurring?.interval_count).toBe(3);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule free current phase: resumes quarterly billing in October with reset anchor")}`,
	async () => {
		const customerId = "create-schedule-free-current-october-reset";
		const clockStart = Date.UTC(2027, 4, 2, 16, 49);
		const scheduleStartsAt = Date.UTC(2027, 5, 30, 13, 11);
		const badQuarterlyStartsAt = Date.UTC(2027, 6, 2, 16, 49);
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
		const commercialFree = products.base({
			id: "commercial-free-access",
			items: [items.monthlyMessages({ includedUsage: 500 })],
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
					list: [
						agencyMonthly,
						rpsAddOn,
						commercialQuarterly,
						commercialFree,
					],
				}),
			],
			actions: [s.billing.attach({ productId: agencyMonthly.id })],
		});

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
					plans: [{ plan_id: commercialFree.id }],
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

		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			billing_behavior: "none",
			phases: [
				{
					starts_at: scheduleStartsAt,
					plans: [{ plan_id: agencyMonthly.id }, { plan_id: rpsAddOn.id }],
				},
				{
					starts_at: badQuarterlyStartsAt,
					plans: [{ plan_id: commercialFree.id }],
				},
				{
					starts_at: paidStartsAt,
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: commercialQuarterly.id }],
				},
				{
					starts_at: freeStartsAt,
					plans: [{ plan_id: commercialFree.id }],
				},
				{
					starts_at: paidResumesAt,
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: commercialQuarterly.id }],
				},
			],
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
);

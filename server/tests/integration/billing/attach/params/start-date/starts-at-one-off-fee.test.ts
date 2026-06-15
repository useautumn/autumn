/**
 * Repro: scheduled (future starts_at) attach drops one-time onboarding fee.
 *
 * Real customer (c31da5f9-204f-4b8b-9d6b-4a72ea97c74c) attached a new plan
 * with a recurring base price + a one-off "onboarding fee" and a future
 * starts_at. The attach succeeded (200, no error) but:
 *   - stripeBillingResult.invoice == "none"
 *   - the Stripe schedule phase contained ONLY the recurring price; the
 *     one-off fee price was missing.
 * => the customer was never charged the one-time fee.
 *
 * Correct behaviour (confirmed with the reporter): the one-off fee is charged
 * when the plan ACTIVATES at starts_at — not up front — for both a pure
 * scheduled attach and an enable_plan_immediately attach. It rides on the
 * activating schedule phase's add_invoice_items.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	CusProductStatus,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductScheduled } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import type Stripe from "stripe";
import { getCustomerProduct } from "./utils";

const ONBOARDING_FEE = 20;
const BILLING_UNITS = 1;

// products.pro -> $20/mo base + one-off onboarding fee billed via Messages.
const buildProWithOnboardingFee = (id: string) =>
	products.pro({
		id,
		items: [
			items.oneOffMessages({
				includedUsage: 0,
				billingUnits: BILLING_UNITS,
				price: ONBOARDING_FEE,
			}),
		],
	});

const onboardingFeeQuantities = [
	{ feature_id: TestFeature.Messages, quantity: 1 },
];

const expectOnboardingFeeOnActivatingPhase = async ({
	ctx,
	scheduleId,
	startDate,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	scheduleId: string;
	startDate: number;
}) => {
	const stripeSchedule = (await ctx.stripeCli.subscriptionSchedules.retrieve(
		scheduleId,
	)) as Stripe.SubscriptionSchedule;
	const firstPhase = stripeSchedule.phases[0];
	expect(firstPhase?.start_date).toBe(Math.floor(startDate / 1000));
	// The one-off fee rides on the activating phase as an add_invoice_item, so
	// Stripe charges it once when the plan starts. BUG: oneOffItems were dropped.
	expect(firstPhase?.add_invoice_items.length ?? 0).toBeGreaterThanOrEqual(1);
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: pure scheduled attach (future starts_at, Scheduled status)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Matches the customer exactly: brand-new plan, future starts_at, one-off
// onboarding fee. Nothing is charged today (Scheduled); the fee is queued on
// the activating phase and charged when the plan starts.
test.concurrent(`${chalk.yellowBright("starts_at one-off: scheduled attach queues the onboarding fee on the activating phase")}`, async () => {
	const customerId = "starts-at-oneoff-scheduled";
	const pro = buildProWithOnboardingFee("pro-oneoff-scheduled");

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const startDate = addDays(advancedTo, 7).getTime();

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		starts_at: startDate,
		feature_quantities: onboardingFeeQuantities,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectProductScheduled({ customer, productId: pro.id, startsAt: startDate });

	const cusProduct = await getCustomerProduct({ ctx, customerId, productId: pro.id });
	expect(cusProduct.status).toBe(CusProductStatus.Scheduled);
	expect(cusProduct.scheduled_ids).toHaveLength(1);

	// Nothing is charged today — billing starts when the schedule activates.
	await expectCustomerInvoiceCorrect({ customerId, count: 0 });

	await expectOnboardingFeeOnActivatingPhase({
		ctx,
		scheduleId: cusProduct.scheduled_ids![0]!,
		startDate,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: immediate-access future attach (enable_plan_immediately)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Access starts now, but billing starts later. The one-off onboarding fee is
// NOT charged up front — it's deferred to the activating phase like the pure
// scheduled case, so it's invoiced once when the plan starts.
test.concurrent(`${chalk.yellowBright("starts_at one-off: immediate-access future attach defers the onboarding fee to the activating phase")}`, async () => {
	const customerId = "starts-at-oneoff-immediate-access";
	const pro = buildProWithOnboardingFee("pro-oneoff-immediate-access");

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const startDate = addDays(advancedTo, 7).getTime();

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		starts_at: startDate,
		enable_plan_immediately: true,
		feature_quantities: onboardingFeeQuantities,
	});

	const cusProduct = await getCustomerProduct({ ctx, customerId, productId: pro.id });
	expect(cusProduct.status).toBe(CusProductStatus.Active);
	expect(cusProduct.scheduled_ids).toHaveLength(1);

	// Nothing is charged up front — the fee is billed when the plan activates.
	await expectCustomerInvoiceCorrect({ customerId, count: 0 });

	await expectOnboardingFeeOnActivatingPhase({
		ctx,
		scheduleId: cusProduct.scheduled_ids![0]!,
		startDate,
	});
});

/**
 * Regression test for scheduled attaches whose Stripe schedule is rescheduled
 * outside Autumn (e.g. Stripe dashboard) before it starts. Fully webhook-driven:
 * no handlers are invoked in-process — assertions poll for the effects of real
 * stripe-listen deliveries.
 *
 * Pre-fix: Autumn ignored subscription_schedule.updated, so the scheduled
 * customerProduct kept its stale starts_at; when the phase started earlier than
 * that, activation was skipped and the product stayed `scheduled` forever.
 */

import { expect, test } from "bun:test";
import { type AttachParamsV1Input, CusProductStatus, ms } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { getCustomerProduct } from "./utils";

const pollUntil = async <T>({
	fetch,
	until,
	timeoutMs = 60_000,
	intervalMs = 1000,
	label,
}: {
	fetch: () => Promise<T>;
	until: (value: T) => boolean;
	timeoutMs?: number;
	intervalMs?: number;
	label: string;
}): Promise<T> => {
	const deadline = Date.now() + timeoutMs;
	let last: T = await fetch();
	while (!until(last)) {
		if (Date.now() > deadline)
			throw new Error(`Timed out waiting for: ${label}`);
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
		last = await fetch();
	}
	return last;
};

test.concurrent(`${chalk.yellowBright("starts_at: external schedule move resyncs via webhook and activates on phase start")}`, async () => {
	const customerId = "attach-external-schedule-move";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});
	expect(testClockId).toBeDefined();

	const requestedStart = advancedTo + ms.days(2);
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		starts_at: requestedStart,
	});

	const cusProduct = await getCustomerProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(cusProduct.status).toBe(CusProductStatus.Scheduled);
	const scheduleId = cusProduct.scheduled_ids?.[0];
	if (!scheduleId) throw new Error("Expected schedule id");

	const schedule = (await ctx.stripeCli.subscriptionSchedules.retrieve(
		scheduleId,
	)) as Stripe.SubscriptionSchedule;

	// External edit (dashboard-style): move the phase start 8h earlier
	const editedStartSec = Math.floor((requestedStart - ms.hours(8)) / 1000);
	await ctx.stripeCli.subscriptionSchedules.update(scheduleId, {
		phases: schedule.phases.map((phase) => ({
			items: phase.items.map((item) => ({
				price: typeof item.price === "string" ? item.price : item.price?.id,
				quantity: item.quantity,
			})),
			start_date: editedStartSec,
			end_date: phase.end_date ?? undefined,
			proration_behavior: phase.proration_behavior ?? undefined,
		})),
	});

	// Real subscription_schedule.updated webhook resyncs starts_at
	const resyncedProduct = await pollUntil({
		fetch: () => getCustomerProduct({ ctx, customerId, productId: pro.id }),
		until: (cp) => cp.starts_at === editedStartSec * 1000,
		label: `starts_at resync to ${editedStartSec * 1000} via subscription_schedule.updated webhook`,
	});
	expect(resyncedProduct.status).toBe(CusProductStatus.Scheduled);

	// Phase starts at the EDITED (earlier) time; the real
	// customer.subscription.created webhook must activate the scheduled product
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: editedStartSec * 1000 + ms.hours(1),
		waitForSeconds: 30,
	});

	const activatedProduct = await pollUntil({
		fetch: () => getCustomerProduct({ ctx, customerId, productId: pro.id }),
		until: (cp) => cp.status === CusProductStatus.Active,
		label: "scheduled product activation via customer.subscription.created webhook",
	});
	expect(activatedProduct.subscription_ids?.length).toBe(1);

	// The phase-start subscription_schedule.updated (status -> active) must NOT
	// touch starts_at anymore — started schedules are ignored
	expect(activatedProduct.starts_at).toBe(editedStartSec * 1000);

	// No stranded duplicate
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const proProducts = fullCustomer.customer_products.filter(
		(cp) => cp.product_id === pro.id,
	);
	expect(proProducts).toHaveLength(1);
});

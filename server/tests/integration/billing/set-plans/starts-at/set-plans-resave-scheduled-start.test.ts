/**
 * A plan can start before the Stripe subscription that now bills it (it was moved onto a subscription later). Once a
 * schedule exists, the dashboard reopens its first phase on that plan start and re-saves it.
 *
 * Red (before):  the re-save was read as a backdate, recreating the subscription from the plan start, which Stripe
 *                rejects ("billing_cycle_anchor cannot be later than next natural billing date").
 * Green (after): the plan's own start replays the live subscription, so the re-save keeps it and saves the schedule.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

const PLAN_STARTED_BEFORE_SUBSCRIPTION = ms.days(15);

test(`${chalk.yellowBright("set-plans resave scheduled start: a plan starting before its subscription re-saves on its own start without a backdate")}`, async () => {
	const enterprise = products.base({
		id: "enterprise",
		items: [
			items.annualPrice({ price: 18000 }),
			items.consumable({ featureId: TestFeature.Words, price: 0.01 }),
		],
	});
	const { customerId, autumnV2_4, ctx, advancedTo } = await initScenario({
		customerId: "set-plans-resave-scheduled-start",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [enterprise] }),
		],
		actions: [
			s.billing.attach({ productId: enterprise.id }),
			s.advanceTestClock({ days: 20 }),
		],
	});
	const renewalPhaseStartsAt = advancedTo + ms.days(120);
	const renewalPhase = {
		starts_at: renewalPhaseStartsAt,
		plans: [
			{
				plan_id: enterprise.id,
				customize: {
					price: { amount: 20000, interval: BillingInterval.Year },
				},
			},
		],
	};
	await autumnV2_4.billing.setPlans({
		customer_id: customerId,
		phases: [
			{ starts_at: "now", plans: [{ plan_id: enterprise.id }] },
			renewalPhase,
		],
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const live = fullCustomer.customer_products.find(
		(customerProduct) =>
			customerProduct.product.id === enterprise.id &&
			customerProduct.status === "active",
	)!;
	const planStart = live.starts_at - PLAN_STARTED_BEFORE_SUBSCRIPTION;
	await CusProductService.update({
		ctx,
		cusProductId: live.id,
		updates: { starts_at: planStart },
	});
	await deleteCachedFullCustomer({ ctx, customerId, skipGuard: true });

	const resave: SetPlansParamsV0Input = {
		customer_id: customerId,
		phases: [
			{ starts_at: planStart, plans: [{ plan_id: enterprise.id }] },
			renewalPhase,
		],
	};
	const preview = await autumnV2_4.billing.previewSetPlans(resave);
	expect(preview.warnings.map(({ type }) => type)).not.toContain(
		"subscription_recreated_backdated",
	);

	const subscriptionId = live.subscription_ids![0]!;
	const scheduleId = live.scheduled_ids![0]!;
	const invoicesBefore = await ctx.stripeCli.invoices.list({
		subscription: subscriptionId,
		limit: 100,
	});

	await autumnV2_4.billing.setPlans(resave);

	const subscription =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	expect(subscription.status).toBe("active");
	expect(subscription.schedule).toBe(scheduleId);
	const schedule =
		await ctx.stripeCli.subscriptionSchedules.retrieve(scheduleId);
	expect(
		schedule.phases.some(
			({ start_date }) =>
				start_date === Math.floor(renewalPhaseStartsAt / 1000),
		),
	).toBe(true);
	const invoicesAfter = await ctx.stripeCli.invoices.list({
		subscription: subscriptionId,
		limit: 100,
	});
	expect(invoicesAfter.data.length).toBe(invoicesBefore.data.length);
});

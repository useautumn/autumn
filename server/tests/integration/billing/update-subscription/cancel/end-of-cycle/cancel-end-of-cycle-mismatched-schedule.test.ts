import { expect, test } from "bun:test";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { CusService } from "@/internal/customers/CusService";

test.concurrent(`${chalk.yellowBright("cancel EOC: ignores schedules from other subscriptions")}`, async () => {
	const customerId = "cancel-eoc-mismatched-schedule";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const monthlyAddon = products.base({
		id: "monthly-addon",
		isAddOn: true,
		items: [items.monthlyPrice({ price: 7 })],
	});
	const annualAddon = products.base({
		id: "annual-addon",
		isAddOn: true,
		items: [items.annualPrice({ price: 70 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, monthlyAddon, annualAddon] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV1.billing.multiAttach({
		customer_id: customerId,
		plans: [{ plan_id: monthlyAddon.id }, { plan_id: annualAddon.id }],
		new_billing_subscription: true,
	});

	const proSubId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});
	const monthlyAddonSubId = await getSubscriptionId({
		ctx,
		customerId,
		productId: monthlyAddon.id,
	});
	const annualAddonSubId = await getSubscriptionId({
		ctx,
		customerId,
		productId: annualAddon.id,
	});

	expect(proSubId).not.toBe(monthlyAddonSubId);
	expect(monthlyAddonSubId).toBe(annualAddonSubId);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: monthlyAddon.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const addonSubWithSchedule =
		await ctx.stripeCli.subscriptions.retrieve(monthlyAddonSubId);
	expect(addonSubWithSchedule.schedule).not.toBeNull();
	const addonScheduleId = addonSubWithSchedule.schedule as string;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const proSubAfterCancel = await ctx.stripeCli.subscriptions.retrieve(proSubId);
	const addonSubAfterProCancel =
		await ctx.stripeCli.subscriptions.retrieve(monthlyAddonSubId);

	expect(isStripeSubscriptionCanceling(proSubAfterCancel)).toBe(true);
	expect(proSubAfterCancel.schedule).toBeNull();
	expect(addonSubAfterProCancel.schedule).toBe(addonScheduleId);

	const fullCustomer = await CusService.getFull({ ctx, idOrInternalId: customerId });
	const proCustomerProduct = fullCustomer.customer_products.find(
		(cp) => cp.product.id === pro.id,
	);
	const monthlyAddonCustomerProduct = fullCustomer.customer_products.find(
		(cp) => cp.product.id === monthlyAddon.id,
	);

	expect(proCustomerProduct?.scheduled_ids ?? []).toEqual([]);
	expect(monthlyAddonCustomerProduct?.scheduled_ids).toEqual([addonScheduleId]);
});

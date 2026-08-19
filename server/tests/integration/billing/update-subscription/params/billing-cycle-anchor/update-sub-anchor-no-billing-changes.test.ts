import { expect, test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { findActiveCustomerProductById } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import { CusService } from "@/internal/customers/CusService.js";

test(`${chalk.yellowBright("update-sub scheduled anchor no billing changes: updates Autumn without touching Stripe")}`, async () => {
	const customerId = "update-anchor-no-billing";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_3, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId: pro.id,
	});
	const subscriptionId = customerProduct?.subscription_ids?.[0];
	if (!subscriptionId) throw new Error("Expected a Stripe subscription");
	const stripeSubscriptionBefore =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	const scheduledAnchorMs = addDays(advancedTo, 10).getTime();

	await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		billing_cycle_anchor: scheduledAnchorMs,
		no_billing_changes: true,
	});

	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		nextResetAt: scheduledAnchorMs,
	});
	const stripeSubscriptionAfter =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	expect(stripeSubscriptionAfter.billing_cycle_anchor).toBe(
		stripeSubscriptionBefore.billing_cycle_anchor,
	);
	expect(stripeSubscriptionAfter.schedule).toBe(
		stripeSubscriptionBefore.schedule,
	);
});

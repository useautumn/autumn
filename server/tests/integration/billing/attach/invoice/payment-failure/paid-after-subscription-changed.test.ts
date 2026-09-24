/**
 * A failed-card upgrade stays pending until its invoice is paid. If the subscription
 * changes in the meantime, paying the invoice must still promote the upgrade.
 *
 * Red (before):  invoice.paid replays the attach-time subscription update against rows
 *                and Stripe items that have since changed
 * Green (after): Premium active, Pro gone, Stripe subscription matches
 */

import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	type DeferredAutumnBillingPlanData,
	FreeTrialDuration,
	MetadataType,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer";

/** Applies the upgrade's planned prices out of band, retiring every current subscription item id. */
const replaceSubscriptionItemsWithPlannedPrices = async ({
	ctx,
	invoiceId,
}: {
	ctx: TestContext;
	invoiceId: string;
}) => {
	const metadata = await MetadataService.getByStripeInvoiceId({
		db: ctx.db,
		stripeInvoiceId: invoiceId,
		type: MetadataType.DeferredInvoice,
	});
	const { billingPlan } = metadata!.data as DeferredAutumnBillingPlanData;
	const subscriptionAction = billingPlan.stripe.subscriptionAction;
	if (subscriptionAction?.type !== "update") {
		throw new Error("Expected the deferred upgrade to update the subscription");
	}

	const plannedPrices = (subscriptionAction.params.items ?? []).flatMap(
		(item) =>
			!item.id && item.price
				? [{ price: item.price, quantity: item.quantity }]
				: [],
	);
	const subscription = await ctx.stripeCli.subscriptions.retrieve(
		subscriptionAction.stripeSubscriptionId,
	);

	await ctx.stripeCli.subscriptions.update(subscription.id, {
		items: [
			...subscription.items.data.map((item) => ({
				id: item.id,
				deleted: true,
			})),
			...plannedPrices,
		],
		proration_behavior: "none",
	});
};

test.concurrent(
	`${chalk.yellowBright("paid after sub changed: a pending upgrade is promoted when its invoice is paid late")}`,
	async () => {
		const customerId = "paid-after-sub-changed";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { ctx, autumnV2_4, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.attachPaymentMethod({ type: "fail" }),
			],
		});

		const upgrade = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});
		expect(upgrade.required_action?.code).toBe("payment_failed");

		await attachPaymentMethod({
			stripeCli: ctx.stripeCli,
			stripeCusId: customer!.processor!.id,
			type: "success",
		});
		await autumnV2_4.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
				},
			},
		});

		await ctx.stripeCli.invoices.pay(upgrade.invoice!.stripe_id);

		await expectCustomerProducts({
			customerId,
			active: [premium.id],
			notPresent: [pro.id],
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("paid after sub changed: the upgrade already applied in Stripe does not strand the plan")}`,
	async () => {
		const customerId = "paid-after-items-replaced";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { ctx, autumnV2_4, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.attachPaymentMethod({ type: "fail" }),
			],
		});

		const upgrade = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});
		expect(upgrade.required_action?.code).toBe("payment_failed");

		await replaceSubscriptionItemsWithPlannedPrices({
			ctx,
			invoiceId: upgrade.invoice!.stripe_id,
		});

		await attachPaymentMethod({
			stripeCli: ctx.stripeCli,
			stripeCusId: customer!.processor!.id,
			type: "success",
		});
		await ctx.stripeCli.invoices.pay(upgrade.invoice!.stripe_id);

		await expectCustomerProducts({
			customerId,
			active: [premium.id],
			notPresent: [pro.id],
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

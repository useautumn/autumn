/**
 * Unlinking a customer's Stripe customer (`stripe_id: null`) leaves the active
 * customer product pointing at a Stripe subscription the customer no longer
 * owns. That linkage must not strand the plan: an immediate cancel detaches
 * Autumn-side state, and any other update surfaces the ownership fault.
 *
 * Red (current):  the subscription ownership check dereferences the unlinked
 *                 processor and every update — including the dashboard preview
 *                 that precedes a cancel — 500s with
 *                 "null is not an object (evaluating 'fullCus.processor.id')".
 * Green (after):  cancel_immediately succeeds and leaves the old subscription
 *                 untouched; cancel_end_of_cycle rejects with
 *                 "is not for the current customer".
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Attaches a paid plan, then unlinks the Stripe customer so the active customer
 * product keeps a subscription id the customer no longer owns.
 */
const setupUnlinkedStripeCustomer = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const { ctx, autumnV2_4 } = scenario;

	const unlinkedSubscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	await autumnV2_4.customers.update(customerId, { stripe_id: null });

	return { ...scenario, free, pro, unlinkedSubscriptionId };
};

test(`${chalk.yellowBright("unlinked stripe customer: cancel_immediately succeeds and leaves the old sub alone")}`, async () => {
	const customerId = "unlinked-stripe-cancel-now";

	const { autumnV1, autumnV2_4, ctx, free, pro, unlinkedSubscriptionId } =
		await setupUnlinkedStripeCustomer({ customerId });

	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
			?.length ?? 0;

	await autumnV2_4.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
		{
			customer_id: customerId,
			plan_id: pro.id,
			cancel_action: "cancel_immediately",
		},
	);

	await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		cancel_action: "cancel_immediately",
	});

	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		notPresent: [pro.id],
		active: [free.id],
	});

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});

	const unlinkedSubscription = await ctx.stripeCli.subscriptions.retrieve(
		unlinkedSubscriptionId,
	);
	expect(unlinkedSubscription.status).toBe("active");
	expect(unlinkedSubscription.cancel_at_period_end).toBe(false);
	expect(unlinkedSubscription.canceled_at).toBeNull();
});

test(`${chalk.yellowBright("unlinked stripe customer: cancel_end_of_cycle rejects with the ownership fault")}`, async () => {
	const customerId = "unlinked-stripe-cancel-eoc";

	const { autumnV1, autumnV2_4, pro, unlinkedSubscriptionId } =
		await setupUnlinkedStripeCustomer({ customerId });

	const ownershipFault = `Subscription ${unlinkedSubscriptionId} is not for the current customer`;

	await expectAutumnError({
		errMessage: ownershipFault,
		func: () =>
			autumnV2_4.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			}),
	});

	await expectAutumnError({
		errMessage: ownershipFault,
		func: () =>
			autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			}),
	});

	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		active: [pro.id],
	});
});

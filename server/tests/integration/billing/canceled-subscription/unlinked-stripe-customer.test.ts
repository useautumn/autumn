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

test(`${chalk.yellowBright("unlinked stripe customer: no_billing_changes cancel_end_of_cycle succeeds Autumn-only")}`, async () => {
	const customerId = "unlinked-stripe-cancel-nbc";

	const { autumnV1, autumnV2_4, ctx, pro, unlinkedSubscriptionId } =
		await setupUnlinkedStripeCustomer({ customerId });

	await autumnV2_4.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
		{
			customer_id: customerId,
			plan_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
			no_billing_changes: true,
		},
	);

	await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
		no_billing_changes: true,
	});

	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		canceling: [pro.id],
	});

	const unlinkedSubscription = await ctx.stripeCli.subscriptions.retrieve(
		unlinkedSubscriptionId,
	);
	expect(unlinkedSubscription.status).toBe("active");
	expect(unlinkedSubscription.cancel_at_period_end).toBe(false);
	expect(unlinkedSubscription.canceled_at).toBeNull();
});

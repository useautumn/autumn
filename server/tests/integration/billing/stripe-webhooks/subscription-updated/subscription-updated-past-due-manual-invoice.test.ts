/** customer.subscription.updated webhook - past_due: failed payments flip the customer
 * product to past_due while its features stay available. */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	CusProductStatus,
	customerProducts,
} from "@autumn/shared";
import {
	expectProductActive,
	expectProductPastDue,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import {
	type ExpandedStripeSubscription,
	getExpandedStripeSubscription,
} from "@/external/stripe/subscriptions";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";
import { syncCustomerProductStatus } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/syncCustomerProductStatus/syncCustomerProductStatus";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

const createManualBillingUpdateInvoice = async ({
	ctx,
	stripeCustomerId,
	manualBillingUpdate = true,
}: {
	ctx: ScenarioCtx;
	stripeCustomerId: string;
	manualBillingUpdate?: boolean;
}) => {
	const invoice = await ctx.stripeCli.invoices.create({
		customer: stripeCustomerId,
		auto_advance: false,
		metadata: manualBillingUpdate
			? {
					autumn_billing_update: "true",
					autumn_invoice_mode: "false",
				}
			: undefined,
	});

	return invoice.id;
};

const syncManualPastDue = async ({
	ctx,
	customerId,
	subscriptionId,
	latestInvoiceId,
	previousAttributes,
}: {
	ctx: ScenarioCtx;
	customerId: string;
	subscriptionId: string;
	latestInvoiceId: string;
	previousAttributes: StripeSubscriptionUpdatedContext["previousAttributes"];
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeSubscription = await getExpandedStripeSubscription({
		ctx,
		subscriptionId,
	});
	const pastDueSubscription = {
		...stripeSubscription,
		status: "past_due",
		latest_invoice: latestInvoiceId,
	} as ExpandedStripeSubscription;

	await syncCustomerProductStatus({
		ctx: {
			...ctx,
			fullCustomer,
			stripeEvent: {
				id: `evt_${latestInvoiceId}`,
				object: "event",
				api_version: null,
				created: Math.floor(Date.now() / 1000),
				data: { object: pastDueSubscription },
				livemode: false,
				pending_webhooks: 0,
				request: null,
				type: "customer.subscription.updated",
			} as Stripe.Event,
		} satisfies StripeWebhookContext,
		subscriptionUpdatedContext: {
			stripeSubscription: pastDueSubscription,
			previousAttributes,
			fullCustomer,
			customerProducts: [...fullCustomer.customer_products],
			nowMs: Date.now(),
			results: { errors: [] },
			updatedCustomerProducts: [],
			deletedCustomerProducts: [],
			insertedCustomerProducts: [],
			oneOffPrepaidCarryOvers: [],
			billingChangeTags: new Set<string>(),
		},
	});

	await deleteCachedFullCustomer({ ctx, customerId });
};

/** TDD: duplicate manual upgrade invoices can emit past_due with only latest_invoice changed.
 * Red flips the active plan to past_due; green ignores manual billing-update invoices. */
test.concurrent(
	`${chalk.yellowBright("sub.updated: duplicate manual upgrade invoice does not mark active plan past_due")}`,
	async () => {
		const customerId = "sub-updated-manual-duplicate-invoice";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomerId = fullCustomer.processor?.id;
		expect(stripeCustomerId).toBeDefined();

		const firstInvoiceId = await createManualBillingUpdateInvoice({
			ctx,
			stripeCustomerId: stripeCustomerId!,
		});
		await syncManualPastDue({
			ctx,
			customerId,
			subscriptionId,
			latestInvoiceId: firstInvoiceId,
			previousAttributes: { status: "active" },
		});

		const customerAfterFirst =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerAfterFirst,
			productId: pro.id,
		});

		const secondInvoiceId = await createManualBillingUpdateInvoice({
			ctx,
			stripeCustomerId: stripeCustomerId!,
		});
		await syncManualPastDue({
			ctx,
			customerId,
			subscriptionId,
			latestInvoiceId: secondInvoiceId,
			previousAttributes: {
				latest_invoice: firstInvoiceId,
			},
		});

		const customerAfterSecond =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerAfterSecond,
			productId: pro.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("sub.updated: duplicate manual invoice keeps past_due plan past_due")}`,
	async () => {
		const customerId = "sub-updated-manual-duplicate-past-due";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomerId = fullCustomer.processor?.id;
		expect(stripeCustomerId).toBeDefined();
		const cusProduct = fullCustomer.customer_products.find(
			(cp) => cp.product.id === pro.id,
		);
		expect(cusProduct).toBeDefined();
		await ctx.db
			.update(customerProducts)
			.set({ status: CusProductStatus.PastDue })
			.where(eq(customerProducts.id, cusProduct!.id));
		await deleteCachedFullCustomer({ ctx, customerId });

		const firstManualInvoiceId = await createManualBillingUpdateInvoice({
			ctx,
			stripeCustomerId: stripeCustomerId!,
		});
		const secondManualInvoiceId = await createManualBillingUpdateInvoice({
			ctx,
			stripeCustomerId: stripeCustomerId!,
		});

		await syncManualPastDue({
			ctx,
			customerId,
			subscriptionId,
			latestInvoiceId: secondManualInvoiceId,
			previousAttributes: {
				latest_invoice: firstManualInvoiceId,
			},
		});

		const customerAfterSync =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductPastDue({
			customer: customerAfterSync,
			productId: pro.id,
		});
	},
);

/**
 * Subscription Updated Webhook - Past Due Tests
 *
 * Tests for handling the `customer.subscription.updated` Stripe webhook event
 * when a subscription enters past_due status due to failed payment.
 *
 * These tests simulate payment failures by attaching a failing payment method,
 * then advancing to the next billing cycle where the renewal invoice fails.
 *
 * The webhook handler should:
 * - Update customer product status to past_due
 * - Maintain the product features while in past_due state
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV1Input,
	CusProductStatus,
	customerProducts,
} from "@autumn/shared";
import type Stripe from "stripe";
import {
	getExpandedStripeSubscription,
	type ExpandedStripeSubscription,
} from "@/external/stripe/subscriptions";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";
import { syncCustomerProductStatus } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/syncCustomerProductStatus/syncCustomerProductStatus";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductPastDue,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { eq } from "drizzle-orm";
import chalk from "chalk";
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
			updatedCustomerProducts: [],
			deletedCustomerProducts: [],
			insertedCustomerProducts: [],
			oneOffPrepaidCarryOvers: [],
			billingChangeTags: new Set<string>(),
		},
	});

	await deleteCachedFullCustomer({ ctx, customerId });
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Subscription enters past_due after failed payment at renewal
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init pro product ($20/mo) with messages feature
 * - Attach pro to customer with successful payment method
 * - Switch to a failing payment method
 * - Advance to next billing cycle (invoice will fail)
 *
 * Expected Result:
 * - Pro product status becomes past_due
 * - Renewal invoice is open (unpaid)
 */
test.concurrent(`${chalk.yellowBright("sub.updated: product enters past_due after failed renewal payment")}`, async () => {
	const customerId = "sub-updated-past-due-basic";

	const messagesItem = items.monthlyMessages({ includedUsage: 10 });
	const dashboardItem = items.dashboard();
	const adminItem = items.adminRights();

	const pro = products.pro({
		id: "pro",
		items: [dashboardItem, messagesItem, adminItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "fail" }),
			s.advanceTestClock({ toNextInvoice: true }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductPastDue({
		customer,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 0,
		latestTotal: 20,
		latestStatus: "open",
		latestInvoiceProductId: pro.id,
	});
});

/** TDD: duplicate manual upgrade invoices can emit past_due with only latest_invoice changed.
 * Red flips the active plan to past_due; green ignores manual billing-update invoices. */
test.concurrent(`${chalk.yellowBright("sub.updated: duplicate manual upgrade invoice does not mark active plan past_due")}`, async () => {
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
});

test.concurrent(`${chalk.yellowBright("sub.updated: duplicate manual invoice keeps past_due plan past_due")}`, async () => {
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
});

test.concurrent(`${chalk.yellowBright("sub.updated 2: invoice mode upgrade, product enters past_due after no payment")}`, async () => {
	const customerId = "sub-updated-2";

	const messagesItem = items.monthlyMessages({ includedUsage: 10 });
	const dashboardItem = items.dashboard();
	const adminItem = items.adminRights();

	const pro = products.pro({
		id: "pro",
		items: [dashboardItem, messagesItem, adminItem],
	});

	const premium = products.premium({
		id: "premium",
		items: [dashboardItem, messagesItem, adminItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.billing.attach({
				productId: premium.id,
				invoice: true,
				enableProductImmediately: true,
				finalizeInvoice: true,
			}),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "fail" }),
			s.advanceTestClock({ weeks: 6, waitForSeconds: 30 }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductPastDue({
		customer,
		productId: premium.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Upgrade while past_due keeps product in past_due
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("sub.updated 3: upgrade from premium to ultra while past_due, product stays past_due")}`, async () => {
	const customerId = "sub-updated-past-due-upgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 10 });

	const premium = products.premium({
		id: "premium",
		items: [messagesItem],
	});

	const ultra = products.ultra({
		id: "ultra",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, ultra] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "fail" }),
			s.advanceToNextInvoice(),
		],
	});

	const customerBeforeUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductPastDue({
		customer: customerBeforeUpgrade,
		productId: premium.id,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: ultra.id,
	});

	const customerAfterUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterUpgrade,
		pastDue: [premium.id],
		notPresent: [ultra.id],
	});
});

test.concurrent(`${chalk.yellowBright("sub.updated 4: invoice-mode upgrade can leave send_invoice invoice on charge_automatically past_due sub")}`, async () => {
	const customerId = "sub-updated-past-due-invoice-mode-mismatch";

	const messagesItem = items.monthlyMessages({ includedUsage: 10 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV2_2, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { subscriptionId } = await driveProductPastDue({
		ctx,
		testClockId: testClockId!,
		customerId,
		productId: pro.id,
	});

	// Mirror the production drift: Stripe is past_due, but Autumn still sees the
	// existing product as attachable/active before the invoice-mode upgrade.
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const cusProduct = fullCustomer.customer_products.find(
		(cp) => cp.product.id === pro.id,
	);
	await ctx.db
		.update(customerProducts)
		.set({ status: CusProductStatus.Active })
		.where(eq(customerProducts.id, cusProduct!.id));
	await deleteCachedFullCustomer({ ctx, customerId });

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		invoice_mode: { enabled: true, net_terms_days: 30 },
		enable_plan_immediately: true,
	});

	const sub = await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	expect(sub.status).toBe("past_due");
	expect(sub.collection_method).toBe("charge_automatically");

	const latestInvoiceId =
		typeof sub.latest_invoice === "string"
			? sub.latest_invoice
			: sub.latest_invoice?.id;
	expect(latestInvoiceId).toBeTruthy();

	const invoice = await ctx.stripeCli.invoices.retrieve(latestInvoiceId!);
	expect(invoice.collection_method).toBe("send_invoice");
	expect(invoice.status).toBe("open");
	expect(invoice.attempted).toBe(false);
	expect(invoice.attempt_count).toBe(0);
	expect(invoice.due_date).toBeTruthy();
});

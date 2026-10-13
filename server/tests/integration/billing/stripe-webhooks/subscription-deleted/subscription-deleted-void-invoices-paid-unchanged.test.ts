import { expect, test } from "bun:test";
import { type ApiCustomerV3, ApiVersion } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils";
import { CusService } from "@/internal/customers/CusService";
import { OrgService } from "@/internal/orgs/OrgService";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Only voidable invoices are voided (paid invoices unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init pro ($20/mo) and free (default) products
 * - Attach pro to customer with successful payment (1st invoice paid)
 * - Switch to a failing payment method
 * - Advance test clock to next billing cycle (payment fails, invoice goes to 'open')
 * - Cancel subscription via Stripe
 * - Config void_invoices_on_subscription_deletion is TRUE
 *
 * Expected Result:
 * - Open invoice is voided
 * - Paid invoice remains paid (unchanged)
 * - Exactly 1 voided invoice, exactly 1 paid invoice, 0 open invoices
 *
 * This verifies the feature only voids voidable invoice statuses, not all invoices.
 */
test(`${chalk.yellowBright("sub.deleted: only voidable invoices voided, paid invoices unchanged")}`, async () => {
	const customerId = "sub-deleted-void-multiple";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	// Initialize scenario with test clock enabled
	const { ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Save original org config and enable void_invoices_on_subscription_deletion
	const originalOrgConfig = ctx.org.config;
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				void_invoices_on_subscription_deletion: true,
			},
		},
	});

	try {
		const autumnV1 = new AutumnInt({
			version: ApiVersion.V1_2,
			secretKey: ctx.orgSecretKey,
		});

		// Verify pro is active after initial attach (1st invoice is paid)
		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerAfterAttach,
			productId: pro.id,
		});

		// Get subscription ID
		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});

		// Get the customer record to access Stripe customer ID
		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		// Verify we have 1 paid invoice from the initial subscription
		const invoicesAfterAttach = await ctx.stripeCli.invoices.list({
			customer: customer!.processor?.id,
			subscription: subscriptionId,
		});
		const paidInvoicesInitial = invoicesAfterAttach.data.filter(
			(inv) => inv.status === "paid",
		);
		expect(paidInvoicesInitial.length).toBe(1);

		// Switch to a failing payment method
		await attachFailedPaymentMethod({
			stripeCli: ctx.stripeCli,
			customer: customer!,
		});

		// Get the failing payment method and set it on the subscription
		const paymentMethods = await ctx.stripeCli.paymentMethods.list({
			customer: customer!.processor?.id,
		});
		const failingPaymentMethod = paymentMethods.data[0];

		await ctx.stripeCli.subscriptions.update(subscriptionId, {
			default_payment_method: failingPaymentMethod.id,
		});

		// Advance to next billing cycle - payment will fail, creating an open invoice
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// Wait for Stripe to process the billing and payment attempt
		await timeout(4000);

		// Verify invoice statuses before cancellation: 1 paid, 1 open
		const invoicesBeforeCancel = await ctx.stripeCli.invoices.list({
			customer: customer!.processor?.id,
			subscription: subscriptionId,
		});

		const paidBeforeCancel = invoicesBeforeCancel.data.filter(
			(inv) => inv.status === "paid",
		);
		const openBeforeCancel = invoicesBeforeCancel.data.filter(
			(inv) => inv.status === "open",
		);

		expect(paidBeforeCancel.length).toBe(1);
		expect(openBeforeCancel.length).toBe(1);

		// Cancel subscription via Stripe
		await ctx.stripeCli.subscriptions.cancel(subscriptionId);

		// Wait for webhook to process
		await timeout(8000);

		// Verify invoice statuses after cancellation
		const invoicesAfterCancel = await ctx.stripeCli.invoices.list({
			customer: customer!.processor?.id,
			subscription: subscriptionId,
		});

		const paidAfterCancel = invoicesAfterCancel.data.filter(
			(inv) => inv.status === "paid",
		);
		const openAfterCancel = invoicesAfterCancel.data.filter(
			(inv) => inv.status === "open",
		);
		const voidedAfterCancel = invoicesAfterCancel.data.filter(
			(inv) => inv.status === "void",
		);

		// Exactly 1 paid invoice (unchanged)
		expect(paidAfterCancel.length).toBe(1);

		// Exactly 0 open invoices (all voided)
		expect(openAfterCancel.length).toBe(0);

		// Exactly 1 voided invoice
		expect(voidedAfterCancel.length).toBe(1);

		// Verify pro is gone and free is active
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [pro.id],
			active: [free.id],
		});

		// Verify no Stripe subscription exists
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	} finally {
		// Restore original org config
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				config: originalOrgConfig,
			},
		});
	}
});

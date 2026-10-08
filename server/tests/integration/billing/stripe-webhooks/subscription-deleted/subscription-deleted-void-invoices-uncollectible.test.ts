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
// TEST 7: Uncollectible invoices are voided
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sub.deleted: uncollectible invoices are voided on subscription cancel")}`, async () => {
	const customerId = "sub-deleted-void-uncollectible";

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

	const { ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

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

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerAfterAttach,
			productId: pro.id,
		});

		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});

		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		await attachFailedPaymentMethod({
			stripeCli: ctx.stripeCli,
			customer: customer!,
		});

		const paymentMethods = await ctx.stripeCli.paymentMethods.list({
			customer: customer!.processor?.id,
		});
		const failingPaymentMethod = paymentMethods.data[0];

		await ctx.stripeCli.subscriptions.update(subscriptionId, {
			default_payment_method: failingPaymentMethod.id,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		await timeout(4000);

		const invoicesBeforeCancel = await ctx.stripeCli.invoices.list({
			customer: customer!.processor?.id,
			subscription: subscriptionId,
		});
		const openInvoiceBeforeCancel = invoicesBeforeCancel.data.find(
			(inv) => inv.status === "open",
		);
		expect(openInvoiceBeforeCancel).toBeDefined();

		const uncollectibleInvoice = await ctx.stripeCli.invoices.markUncollectible(
			openInvoiceBeforeCancel!.id,
		);
		expect(uncollectibleInvoice.status).toBe("uncollectible");

		await ctx.stripeCli.subscriptions.cancel(subscriptionId);

		await timeout(8000);

		const invoiceAfterCancel = await ctx.stripeCli.invoices.retrieve(
			uncollectibleInvoice.id,
		);
		expect(invoiceAfterCancel.status).toBe("void");

		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [pro.id],
			active: [free.id],
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	} finally {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				config: originalOrgConfig,
			},
		});
	}
});

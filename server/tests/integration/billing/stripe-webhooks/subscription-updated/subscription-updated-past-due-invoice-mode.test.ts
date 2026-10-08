/** customer.subscription.updated webhook - past_due: failed payments flip the customer
 * product to past_due while its features stay available. */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV1Input,
	CusProductStatus,
	customerProducts,
} from "@autumn/shared";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { expectProductPastDue } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

test.concurrent(
	`${chalk.yellowBright("sub.updated 2: invoice mode upgrade, product enters past_due after no payment")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("sub.updated 4: invoice-mode upgrade can leave send_invoice invoice on charge_automatically past_due sub")}`,
	async () => {
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
	},
);

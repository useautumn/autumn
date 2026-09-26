/**
 * invoices.paid_at mirrors Stripe's status_transitions.paid_at (epoch ms).
 *
 * Contract:
 *   card attach (charged now)     → paid_at = Stripe paid_at
 *   invoice-mode attach (open)    → paid_at null
 *   invoices.pay (out of band)    → paid_at = Stripe paid_at
 */

import { expect, test } from "bun:test";
import type { ApiListInvoiceV1 } from "@autumn/shared";
import { expectInvoicePaidAtCorrect } from "@tests/integration/invoices/utils/expectInvoicePaidAtCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type AutumnV2_3 = Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];

const listInvoices = async ({
	autumnV2_3,
	customerId,
}: {
	autumnV2_3: AutumnV2_3;
	customerId: string;
}) => {
	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	return list;
};

test.concurrent(
	`${chalk.yellowBright("invoices.paid_at: card attach → paid_at matches Stripe")}`,
	async () => {
		const customerId = "inv-paid-at-card";
		const pro = products.pro({
			id: "pro-paid-at-card",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const [invoice] = await listInvoices({ autumnV2_3, customerId });
		expect(invoice.status).toBe("paid");

		const { expectedPaidAt } = await expectInvoicePaidAtCorrect({
			stripeInvoiceId: invoice.stripe_id,
		});
		expect(expectedPaidAt).not.toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.paid_at: open invoice → null, then invoices.pay → paid_at matches Stripe")}`,
	async () => {
		const customerId = "inv-paid-at-oob";
		const pro = products.pro({
			id: "pro-paid-at-oob",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const attached = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			invoice: true,
			finalize_invoice: true,
			enable_product_immediately: true,
			redirect_mode: "if_required",
		});
		expect(attached.invoice!.status).toBe("open");

		const [openInvoice] = await listInvoices({ autumnV2_3, customerId });
		const { expectedPaidAt: openPaidAt } = await expectInvoicePaidAtCorrect({
			stripeInvoiceId: openInvoice.stripe_id,
		});
		expect(openPaidAt).toBeNull();

		await autumnV2_3.post("/invoices.pay", { invoice_id: openInvoice.id });

		const { expectedPaidAt } = await expectInvoicePaidAtCorrect({
			stripeInvoiceId: openInvoice.stripe_id,
		});
		expect(expectedPaidAt).not.toBeNull();
	},
);

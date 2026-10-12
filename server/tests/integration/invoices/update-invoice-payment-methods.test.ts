/**
 * invoices.update: change which payment methods a Stripe invoice accepts.
 *
 * Contract:
 *   POST /invoices.update { invoice_id, payment_method_types } -> { invoice: ApiListInvoiceV1 }
 *   open invoice   → Stripe payment_settings.payment_method_types replaced
 *   draft invoice  → same
 *   paid invoice   → 400
 */

import { expect, test } from "bun:test";
import { type ApiListInvoiceV1, ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type UpdateResponse = { invoice: ApiListInvoiceV1 };

const firstInvoice = async ({
	autumnV2_3,
	customerId,
}: {
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	customerId: string;
}) => {
	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	return list[0];
};

test.concurrent(
	`${chalk.yellowBright("invoices.update: open invoice takes the new payment method types")}`,
	async () => {
		const customerId = "inv-update-pm-open";
		const pro = products.pro({
			id: "pro-update-pm",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: true,
					finalizeInvoice: true,
				}),
			],
		});

		const openInvoice = await firstInvoice({ autumnV2_3, customerId });
		const { invoice } = (await autumnV2_3.post("/invoices.update", {
			invoice_id: openInvoice.id,
			payment_method_types: ["card"],
		})) as UpdateResponse;
		expect(invoice.id).toBe(openInvoice.id);

		const stripeOpen = await ctx.stripeCli.invoices.retrieve(invoice.stripe_id);
		expect(stripeOpen.status).toBe("open");
		expect(stripeOpen.payment_settings.payment_method_types).toEqual(["card"]);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.update: draft invoice takes the new payment method types")}`,
	async () => {
		const customerId = "inv-update-pm-draft";
		const pro = products.pro({
			id: "pro-update-pm-draft",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: true,
					finalizeInvoice: false,
				}),
			],
		});

		const draftInvoice = await firstInvoice({ autumnV2_3, customerId });
		await autumnV2_3.post("/invoices.update", {
			invoice_id: draftInvoice.id,
			payment_method_types: ["card"],
		});

		const stripeDraft = await ctx.stripeCli.invoices.retrieve(
			draftInvoice.stripe_id,
		);
		expect(stripeDraft.status).toBe("draft");
		expect(stripeDraft.payment_settings.payment_method_types).toEqual(["card"]);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.update: paid invoice → 400")}`,
	async () => {
		const customerId = "inv-update-pm-paid";
		const pro = products.pro({
			id: "pro-update-pm-paid",
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

		const paidInvoice = await firstInvoice({ autumnV2_3, customerId });

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_3.post("/invoices.update", {
					invoice_id: paidInvoice.id,
					payment_method_types: ["card"],
				}),
		});
	},
);

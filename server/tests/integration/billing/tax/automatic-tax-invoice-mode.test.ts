/**
 * Invoice-mode attach with automatic tax: a customer with no billing address is
 * blocked instead of silently invoiced without tax, and billing_details on the
 * same call previews and then saves the address so the invoice is taxed.
 */

import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	type AttachPreviewResponse,
	CusErrorCode,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const auAddress = {
	country: "AU",
	line1: "1 Test St",
	city: "Sydney",
	postal_code: "2000",
	state: "NSW",
};

test.concurrent(
	`${chalk.yellowBright("automatic-tax-invoice-mode: missing address blocks, billing_details taxes the invoice")}`,
	async () => {
		const customerId = "tax-invoice-mode-address";
		const pro = products.pro({ id: "pro", items: [] });

		const { ctx, customer, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: { automatic_tax: true },
					taxRegistrations: ["AU"],
				}),
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const planId = `pro_${customerId}`;
		const invoiceMode = { enabled: true, finalize: true };

		const blockedPreview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: planId,
			invoice_mode: invoiceMode,
		})) as AttachPreviewResponse;
		expect(blockedPreview.tax?.status).toBe("requires_location");

		await expectAutumnError({
			errCode: CusErrorCode.CustomerTaxLocationMissing,
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: planId,
					invoice_mode: invoiceMode,
				}),
		});

		const typedPreview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: planId,
			invoice_mode: invoiceMode,
			billing_details: { address: auAddress },
		})) as AttachPreviewResponse;
		expect(typedPreview.tax?.status).toBe("complete");
		expect(typedPreview.tax?.total).toBeGreaterThan(0);

		const stripeCustomerId = customer!.processor!.id!;
		const unsavedCustomer =
			await ctx.stripeCli.customers.retrieve(stripeCustomerId);
		expect("address" in unsavedCustomer && unsavedCustomer.address).toBeFalsy();

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: planId,
			invoice_mode: invoiceMode,
			billing_details: { address: auAddress },
		});

		const savedCustomer =
			await ctx.stripeCli.customers.retrieve(stripeCustomerId);
		expect("address" in savedCustomer && savedCustomer.address?.country).toBe(
			"AU",
		);

		const invoices = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId,
			limit: 1,
		});
		const invoice = invoices.data[0];
		expect(invoice.automatic_tax.enabled).toBe(true);
		expect(invoice.total).toBeGreaterThan(invoice.subtotal);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("automatic-tax-invoice-mode: tax.automatic_tax false sends an untaxed invoice")}`,
	async () => {
		const customerId = "tax-invoice-mode-optout";
		const pro = products.pro({ id: "pro", items: [] });

		const { ctx, customer, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: { automatic_tax: true },
					taxRegistrations: ["AU"],
				}),
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: `pro_${customerId}`,
			invoice_mode: { enabled: true, finalize: true },
			tax: { automatic_tax: { enabled: false } },
		});

		const invoices = await ctx.stripeCli.invoices.list({
			customer: customer!.processor!.id!,
			limit: 1,
		});
		expect(invoices.data[0].automatic_tax.enabled).toBe(false);
	},
	300_000,
);

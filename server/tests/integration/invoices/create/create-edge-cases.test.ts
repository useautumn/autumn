/**
 * invoices.create — rejections and the hand-off to void / reissue.
 */

import { expect, test } from "bun:test";
import { BillingMethod } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createInvoice } from "./utils/expectCreatedInvoiceCorrect";

const scenario = async ({
	customerId,
	id,
}: {
	customerId: string;
	id: string;
}) => {
	const pro = products.pro({
		id,
		items: [items.prepaidUsers(), items.consumableMessages()],
	});
	const init = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});
	return { ...init, pro };
};

test.concurrent(
	`${chalk.yellowBright("invoices.create: a request with nothing to bill is rejected")}`,
	async () => {
		const customerId = "inv-create-edge-empty";
		const { autumnV2_3, pro } = await scenario({
			customerId,
			id: "pro-edge-empty",
		});

		await expectAutumnError({
			errMessage: "at least one plan or custom line item",
			func: () =>
				createInvoice({ autumnV2_3, params: { customer_id: customerId } }),
		});

		// Base price omitted and every quantity zero is also nothing to invoice.
		await expectAutumnError({
			errMessage: "Nothing to invoice",
			func: () =>
				createInvoice({
					autumnV2_3,
					params: {
						customer_id: customerId,
						plans: [
							{
								plan_id: pro.id,
								customize: { price: null },
								feature_quantities: [
									{
										feature_id: TestFeature.Users,
										billing_behavior: BillingMethod.Prepaid,
										quantity: 0,
									},
								],
							},
						],
					},
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: unknown plan, feature, license and template are all rejected")}`,
	async () => {
		const customerId = "inv-create-edge-unknown";
		const { autumnV2_3, pro } = await scenario({
			customerId,
			id: "pro-edge-unknown",
		});

		await expectAutumnError({
			errMessage: "no-such-plan",
			func: () =>
				createInvoice({
					autumnV2_3,
					params: {
						customer_id: customerId,
						plans: [{ plan_id: "no-such-plan" }],
					},
				}),
		});

		await expectAutumnError({
			errMessage: TestFeature.Words,
			func: () =>
				createInvoice({
					autumnV2_3,
					params: {
						customer_id: customerId,
						plans: [
							{
								plan_id: pro.id,
								feature_quantities: [
									{
										feature_id: TestFeature.Words,
										billing_behavior: BillingMethod.UsageBased,
										quantity: 10,
									},
								],
							},
						],
					},
				}),
		});

		await expectAutumnError({
			errMessage: "not linked",
			func: () =>
				createInvoice({
					autumnV2_3,
					params: {
						customer_id: customerId,
						plans: [
							{
								plan_id: pro.id,
								license_quantities: [
									{ license_plan_id: "no-such-license", quantity: 2 },
								],
							},
						],
					},
				}),
		});

		await expectAutumnError({
			errMessage: "no-such-template",
			func: () =>
				createInvoice({
					autumnV2_3,
					params: {
						customer_id: customerId,
						plans: [{ plan_id: pro.id }],
						invoice_template_id: "no-such-template",
					},
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: malformed feature entries and periods are rejected")}`,
	async () => {
		const customerId = "inv-create-edge-malformed";
		const { autumnV2_3, pro } = await scenario({
			customerId,
			id: "pro-edge-malformed",
		});

		// quantity and usage are mutually exclusive.
		await expectAutumnError({
			func: () =>
				createInvoice({
					autumnV2_3,
					params: {
						customer_id: customerId,
						plans: [
							{
								plan_id: pro.id,
								feature_quantities: [
									{
										feature_id: TestFeature.Messages,
										billing_behavior: BillingMethod.UsageBased,
										quantity: 10,
										usage: [{ feature_id: TestFeature.Action1, quantity: 5 }],
									},
								],
							},
						],
					},
				}),
		});

		await expectAutumnError({
			func: () =>
				createInvoice({
					autumnV2_3,
					params: {
						customer_id: customerId,
						plans: [{ plan_id: pro.id }],
						period_start: Date.UTC(2026, 8, 16),
						period_end: Date.UTC(2026, 8, 1),
					},
				}),
		});

		// A period needs both ends.
		await expectAutumnError({
			func: () =>
				createInvoice({
					autumnV2_3,
					params: {
						customer_id: customerId,
						plans: [{ plan_id: pro.id }],
						period_start: Date.UTC(2026, 8, 1),
					},
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: a created invoice can be voided and reissued")}`,
	async () => {
		const customerId = "inv-create-edge-lifecycle";
		const { autumnV2_3 } = await scenario({
			customerId,
			id: "pro-edge-lifecycle",
		});

		const first = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				custom_line_items: [{ description: "Consulting", amount: 300 }],
			},
		});
		const second = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				custom_line_items: [{ description: "Consulting", amount: 300 }],
			},
		});

		const voided = (await autumnV2_3.post("/invoices.void", {
			invoice_id: first.invoice!.id,
		})) as { invoice: { status: string } };
		expect(voided.invoice.status).toBe("void");

		const reissued = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: second.invoice!.id,
		})) as {
			invoice: { id: string; total: number; status: string };
			voided_invoice_id: string;
		};
		expect(reissued.voided_invoice_id).toBe(second.invoice!.id);
		expect(reissued.invoice.total).toBeCloseTo(300, 2);
		expect(reissued.invoice.status).toBe("open");

		// Void is idempotent: re-voiding returns the same void invoice.
		const revoided = (await autumnV2_3.post("/invoices.void", {
			invoice_id: first.invoice!.id,
		})) as { invoice: { id: string; status: string } };
		expect(revoided.invoice).toMatchObject({
			id: first.invoice!.id,
			status: "void",
		});
	},
);

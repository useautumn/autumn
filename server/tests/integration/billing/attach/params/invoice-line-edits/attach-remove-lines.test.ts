/**
 * remove_lines on attach: drop lines Autumn generated for the upgrade invoice.
 *
 * Contract:
 *   - price: true removes the plan's base price line (here the outgoing plan's credit).
 *   - billing_behavior tells a feature's prepaid and pay-per-use lines apart.
 *   - An entry with no selectors removes every line of the plan.
 *   - The invoice, its stored line rows and the preview all bill only the kept lines.
 */

import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	BillingMethod,
	type BillingPreviewResponse,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectPreviewLinesCorrect,
	expectStripeInvoiceLinesCorrect,
} from "@tests/integration/billing/utils/expectInvoiceLineEditsCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("attach remove_lines 1: removing the old plan's base price keeps the full new charge")}`,
	async () => {
		const customerId = "attach-remove-lines-base";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_5, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
			remove_lines: [{ plan_id: pro.id, price: true }],
		};

		const preview: BillingPreviewResponse =
			await autumnV2_5.billing.previewAttach<AttachParamsV1Input>(params);
		expectPreviewLinesCorrect({
			preview,
			total: 50,
			lines: [{ planId: premium.id, featureId: null, total: 50 }],
		});

		const result = await autumnV2_5.billing.attach<AttachParamsV1Input>(params);
		await expectStripeInvoiceLinesCorrect({
			stripeCli: ctx.stripeCli,
			stripeInvoiceId: result.invoice.stripe_id,
			total: 50,
			lineCount: 1,
		});
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: result.invoice.stripe_id,
			expectedCount: 1,
			expectedTotal: 50,
			allCharges: true,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 50,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach remove_lines 2: billing_behavior removes the pay-per-use line and keeps the prepaid credit")}`,
	async () => {
		const customerId = "attach-remove-lines-behavior";
		const pro = products.pro({
			items: [
				items.prepaidMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
				}),
				items.consumableMessages({ includedUsage: 0 }),
			],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_5, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
				s.track({ featureId: TestFeature.Messages, value: 150 }),
			],
		});

		const baseParams: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
		};
		const basePreview: BillingPreviewResponse =
			await autumnV2_5.billing.previewAttach<AttachParamsV1Input>(baseParams);
		const messageLines = basePreview.line_items.filter(
			(line) =>
				line.plan_id === pro.id && line.feature_id === TestFeature.Messages,
		);
		const overageLine = messageLines.find((line) => line.total > 0);
		const prepaidCredit = messageLines.find((line) => line.total < 0);
		expect(overageLine, "pro bills its messages overage").toBeDefined();
		expect(prepaidCredit, "pro credits its prepaid messages").toBeDefined();

		const params: AttachParamsV1Input = {
			...baseParams,
			remove_lines: [
				{
					plan_id: pro.id,
					feature_quantities: [
						{
							feature_id: TestFeature.Messages,
							billing_behavior: BillingMethod.UsageBased,
						},
					],
				},
			],
		};
		const preview: BillingPreviewResponse =
			await autumnV2_5.billing.previewAttach<AttachParamsV1Input>(params);
		const expectedTotal = basePreview.total - (overageLine?.total ?? 0);
		expectPreviewLinesCorrect({ preview, total: expectedTotal });
		expect(preview.line_items).toHaveLength(basePreview.line_items.length - 1);
		expect(
			preview.line_items.some(
				(line) =>
					line.plan_id === pro.id &&
					line.feature_id === TestFeature.Messages &&
					line.total > 0,
			),
		).toBe(false);

		const result = await autumnV2_5.billing.attach<AttachParamsV1Input>(params);
		await expectStripeInvoiceLinesCorrect({
			stripeCli: ctx.stripeCli,
			stripeInvoiceId: result.invoice.stripe_id,
			total: expectedTotal,
			lineCount: preview.line_items.length,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach remove_lines 3: an entry with no selectors removes every line of the plan")}`,
	async () => {
		const customerId = "attach-remove-lines-plan";
		const pro = products.pro({
			items: [items.consumableMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.consumableMessages({ includedUsage: 500 })],
		});

		const { autumnV2_5, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Messages, value: 150 }),
			],
		});

		// Without the edit: premium $50, pro credit -$20, pro overage 50 x $0.10 = $5
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
			remove_lines: [{ plan_id: pro.id }],
		};
		const preview: BillingPreviewResponse =
			await autumnV2_5.billing.previewAttach<AttachParamsV1Input>(params);
		expectPreviewLinesCorrect({
			preview,
			total: 50,
			lines: [{ planId: premium.id, featureId: null, total: 50 }],
		});

		const result = await autumnV2_5.billing.attach<AttachParamsV1Input>(params);
		await expectStripeInvoiceLinesCorrect({
			stripeCli: ctx.stripeCli,
			stripeInvoiceId: result.invoice.stripe_id,
			total: 50,
			lineCount: 1,
		});
	},
);

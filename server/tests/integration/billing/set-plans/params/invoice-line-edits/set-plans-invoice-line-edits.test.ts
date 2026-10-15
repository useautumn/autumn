/**
 * add_lines / remove_lines on set_plans: top-level fields that patch the first phase's invoice.
 *
 * Contract:
 *   - The immediate invoice drops the removed lines and bills the added ones; later phases are untouched.
 *   - A first phase that starts later rejects add_lines: 400.
 *   - A new subscription bills added lines on its first invoice; remove_lines on it is a 400.
 */

import { expect, test } from "bun:test";
import {
	type SetPlansParamsV0Input,
	StartingAfterDuration,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectPreviewLinesCorrect,
	expectStripeInvoiceLinesCorrect,
} from "@tests/integration/billing/utils/expectInvoiceLineEditsCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const DAY_MS = 24 * 60 * 60 * 1000;

const setupPlans = async ({
	customerId,
	proActive,
}: {
	customerId: string;
	proActive: boolean;
}) => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: proActive ? [s.billing.attach({ productId: pro.id })] : [],
	});
	return { ...scenario, pro, premium };
};

test.concurrent(
	`${chalk.yellowBright("set_plans invoice line edits 1: the first phase's invoice drops the credit and bills the added line")}`,
	async () => {
		const customerId = "set-plans-line-edits-happy";
		const { autumnV2_5, ctx, pro, premium } = await setupPlans({
			customerId,
			proActive: true,
		});

		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					plans: [{ plan_id: premium.id }],
					proration_behavior: "bill_difference",
				},
				{
					starting_after: {
						duration_type: StartingAfterDuration.Month,
						duration_count: 3,
					},
					plans: [{ plan_id: pro.id }],
				},
			],
			remove_lines: [{ plan_id: pro.id, price: true }],
			add_lines: [{ amount: 500, description: "Onboarding" }],
		};

		const preview = await autumnV2_5.billing.previewSetPlans(params);
		expectPreviewLinesCorrect({
			preview,
			total: 550,
			lines: [
				{ planId: premium.id, featureId: null, total: 50 },
				{ description: "Onboarding", total: 500 },
			],
		});
		expect(preview.phases).toHaveLength(2);

		const result = await autumnV2_5.billing.setPlans(params);
		const stripeInvoiceId = result.invoice?.stripe_id;
		if (!stripeInvoiceId) throw new Error("Expected an immediate invoice");
		await expectStripeInvoiceLinesCorrect({
			stripeCli: ctx.stripeCli,
			stripeInvoiceId,
			total: 550,
			lineCount: 2,
			descriptions: ["Onboarding"],
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 550,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set_plans invoice line edits 2: a first phase that starts later rejects add_lines")}`,
	async () => {
		const customerId = "set-plans-line-edits-future";
		const { autumnV2_5, premium, advancedTo } = await setupPlans({
			customerId,
			proActive: true,
		});

		const params = {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo + 10 * DAY_MS,
					plans: [{ plan_id: premium.id }],
				},
			],
		};
		const preview = await autumnV2_5.billing.previewSetPlans(params);
		expect(preview.invoice_lines_addable).toBe(false);

		await expectAutumnError({
			errMessage: "add_lines needs a charge billed now; billing starts later",
			func: () =>
				autumnV2_5.billing.previewSetPlans({
					...params,
					add_lines: [{ amount: 500, description: "Onboarding" }],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set_plans invoice line edits 3: a new subscription takes add_lines but not remove_lines")}`,
	async () => {
		const customerId = "set-plans-line-edits-new-sub";
		const { autumnV2_5, premium } = await setupPlans({
			customerId,
			proActive: false,
		});

		const preview = await autumnV2_5.billing.previewSetPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: premium.id }] }],
			add_lines: [{ amount: 500, description: "Onboarding" }],
		});
		expect(preview.invoice_lines_addable).toBe(true);
		expect(preview.invoice_lines_removable).toBe(false);
		expect(preview.total).toBeCloseTo(550, 2);

		await expectAutumnError({
			errMessage:
				"remove_lines needs a change billed immediately on an existing subscription; this request creates a new subscription",
			func: () =>
				autumnV2_5.billing.previewSetPlans({
					customer_id: customerId,
					phases: [{ starts_at: "now", plans: [{ plan_id: premium.id }] }],
					remove_lines: [{ plan_id: premium.id }],
				}),
		});

		await autumnV2_5.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: premium.id }] }],
			add_lines: [{ amount: 500, description: "Onboarding" }],
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 550,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set_plans invoice line edits 4: a preview line's remove_line removes exactly that line")}`,
	async () => {
		const customerId = "set-plans-line-edits-selector";
		const { autumnV2_5, premium } = await setupPlans({
			customerId,
			proActive: true,
		});

		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					plans: [{ plan_id: premium.id }],
					proration_behavior: "bill_difference",
				},
			],
		};
		const basePreview = await autumnV2_5.billing.previewSetPlans(params);
		expect(basePreview.invoice_lines_removable).toBe(true);
		expect(basePreview.invoice_lines_addable).toBe(true);
		const credit = basePreview.line_items.find(
			(line: { total: number }) => line.total < 0,
		);
		if (!credit?.remove_line) throw new Error("Expected a credit selector");

		const preview = await autumnV2_5.billing.previewSetPlans({
			...params,
			remove_lines: [credit.remove_line],
		});
		expect(preview.line_items).toHaveLength(basePreview.line_items.length - 1);
		expect(preview.total).toBeCloseTo(basePreview.total - credit.total, 2);
	},
);

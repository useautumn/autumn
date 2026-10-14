/**
 * add_lines / remove_lines on update.
 *
 * Contract:
 *   - direction tells a same-plan price change's refund and charge apart under bill_difference.
 *   - add_lines alone on an unchanged subscription bills nothing now, so it's a 400.
 *   - Under proration_behavior "none" both fields are skipped, like custom_line_items.
 *   - Combined with cancel_action, the request is a 400.
 */

import { expect, test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectPreviewLinesCorrect,
	expectStripeInvoiceLinesCorrect,
} from "@tests/integration/billing/utils/expectInvoiceLineEditsCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const setupPro = async ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	return { ...scenario, pro };
};

test.concurrent(
	`${chalk.yellowBright("update invoice line edits 1: direction removes only the credit of a same-plan price change")}`,
	async () => {
		const customerId = "update-line-edits-direction";
		const { autumnV2_5, ctx, pro } = await setupPro({ customerId });

		// bill_difference on $20 -> $30: charge $30, credit -$20, both for the full period.
		const baseParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 30 }) },
			proration_behavior: "bill_difference",
		};

		const bothRemoved = await autumnV2_5.billing.previewUpdate({
			...baseParams,
			remove_lines: [{ plan_id: pro.id, price: true }],
		});
		expectPreviewLinesCorrect({ preview: bothRemoved, total: 0, lines: [] });

		const params: UpdateSubscriptionV1ParamsInput = {
			...baseParams,
			remove_lines: [{ plan_id: pro.id, price: true, direction: "refund" }],
		};
		const preview = await autumnV2_5.billing.previewUpdate(params);
		expectPreviewLinesCorrect({
			preview,
			total: 30,
			lines: [{ planId: pro.id, featureId: null, total: 30 }],
		});

		const result = await autumnV2_5.billing.update(params);
		await expectStripeInvoiceLinesCorrect({
			stripeCli: ctx.stripeCli,
			stripeInvoiceId: result.invoice.stripe_id,
			total: 30,
			lineCount: 1,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 30,
		});
	},
);

for (const prorationBehavior of ["prorate_immediately", "none"] as const) {
	test.concurrent(
		`${chalk.yellowBright(`update invoice line edits 2: add_lines on an unchanged subscription under ${prorationBehavior}`)}`,
		async () => {
			const customerId = `update-line-edits-standalone-${prorationBehavior}`;
			const { autumnV2_5, pro } = await setupPro({ customerId });
			const suppressed = prorationBehavior === "none";

			const params: UpdateSubscriptionV1ParamsInput = {
				customer_id: customerId,
				plan_id: pro.id,
				proration_behavior: prorationBehavior,
				add_lines: [{ amount: 12, description: "Agreed charge" }],
			};

			if (!suppressed) {
				await expectAutumnError({
					errMessage:
						"add_lines needs a charge billed now; this request bills nothing now",
					func: () => autumnV2_5.billing.update(params),
				});
				return;
			}

			const preview = await autumnV2_5.billing.previewUpdate(params);
			expectPreviewLinesCorrect({ preview, total: 0, lines: [] });
			const result = await autumnV2_5.billing.update(params);
			expect(result.invoice).toBeUndefined();
			await expectCustomerInvoiceCorrect({ customerId, count: 1 });
		},
	);
}

test.concurrent(
	`${chalk.yellowBright("update invoice line edits 3: cancel_action can't be combined with add_lines")}`,
	async () => {
		const customerId = "update-line-edits-err-cancel";
		const { autumnV2_5, pro } = await setupPro({ customerId });

		await expectAutumnError({
			errMessage:
				"add_lines and remove_lines can't be combined with cancel_action",
			func: () =>
				autumnV2_5.billing.update({
					customer_id: customerId,
					plan_id: pro.id,
					cancel_action: "cancel_end_of_cycle",
					add_lines: [{ amount: 5, description: "Exit fee" }],
				}),
		});
	},
);

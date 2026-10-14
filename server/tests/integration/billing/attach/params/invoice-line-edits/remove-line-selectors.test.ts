/**
 * Preview lines carry the remove_lines entry that removes exactly that line.
 *
 * Contract:
 *   - Every generated line billed now gets a remove_line; sending it back removes that line and only that line.
 *   - A same-plan price change's refund and charge get different selectors (direction).
 *   - invoice_lines_editable is true on an upgrade of an existing subscription, false for a new subscription.
 */

import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	BillingPreviewResponse,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectStripeInvoiceLinesCorrect } from "@tests/integration/billing/utils/expectInvoiceLineEditsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type PreviewLine = BillingPreviewResponse["line_items"][number];

const lineKey = (line: PreviewLine) => `${line.description}|${line.total}`;

/** Sending back each line's own selector removes exactly that line from the preview. */
const expectEachSelectorRemovesOnlyItsLine = async ({
	basePreview,
	previewWith,
}: {
	basePreview: BillingPreviewResponse;
	previewWith: (
		removeLines: NonNullable<PreviewLine["remove_line"]>[],
	) => Promise<BillingPreviewResponse>;
}) => {
	for (const line of basePreview.line_items) {
		expect(line.remove_line, `${line.description} has a selector`).toBeTruthy();
		if (!line.remove_line) continue;

		const preview = await previewWith([line.remove_line]);
		const expectedKeys = basePreview.line_items
			.filter((other) => other !== line)
			.map(lineKey)
			.sort();
		expect(preview.line_items.map(lineKey).sort()).toEqual(expectedKeys);
		expect(preview.total).toBeCloseTo(basePreview.total - line.total, 2);
	}
};

test.concurrent(
	`${chalk.yellowBright("remove_line selectors 1: every upgrade line's selector removes exactly that line")}`,
	async () => {
		const customerId = "remove-line-selectors-attach";
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

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
		};
		const previewWith = (
			removeLines: NonNullable<PreviewLine["remove_line"]>[],
		) =>
			autumnV2_5.billing.previewAttach<AttachParamsV1Input>({
				...params,
				...(removeLines.length ? { remove_lines: removeLines } : {}),
			}) as Promise<BillingPreviewResponse>;

		// Premium $50, pro credit -$20, pro overage $5
		const basePreview = await previewWith([]);
		expect(basePreview.invoice_lines_removable).toBe(true);
		expect(basePreview.invoice_lines_addable).toBe(true);
		expect(basePreview.line_items).toHaveLength(3);
		await expectEachSelectorRemovesOnlyItsLine({ basePreview, previewWith });

		const overage = basePreview.line_items.find(
			(line) => line.feature_id === TestFeature.Messages,
		);
		if (!overage?.remove_line) throw new Error("Expected an overage selector");
		const result = await autumnV2_5.billing.attach<AttachParamsV1Input>({
			...params,
			remove_lines: [overage.remove_line],
		});
		await expectStripeInvoiceLinesCorrect({
			stripeCli: ctx.stripeCli,
			stripeInvoiceId: result.invoice.stripe_id,
			total: basePreview.total - overage.total,
			lineCount: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("remove_line selectors 2: a same-plan price change's refund and charge get separate selectors")}`,
	async () => {
		const customerId = "remove-line-selectors-update";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_5 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 30 }) },
			proration_behavior: "bill_difference",
		};
		const previewWith = (
			removeLines: NonNullable<PreviewLine["remove_line"]>[],
		) =>
			autumnV2_5.billing.previewUpdate({
				...params,
				...(removeLines.length ? { remove_lines: removeLines } : {}),
			}) as Promise<BillingPreviewResponse>;

		const basePreview = await previewWith([]);
		expect(basePreview.line_items).toHaveLength(2);
		const directions = basePreview.line_items.map(
			(line) => line.remove_line?.direction,
		);
		expect(directions.sort()).toEqual(["charge", "refund"]);
		await expectEachSelectorRemovesOnlyItsLine({ basePreview, previewWith });
	},
);

test.concurrent(
	`${chalk.yellowBright("remove_line selectors 3: a new subscription's preview isn't editable")}`,
	async () => {
		const customerId = "remove-line-selectors-new-sub";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_5 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const preview =
			(await autumnV2_5.billing.previewAttach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: pro.id,
				redirect_mode: "if_required",
			})) as BillingPreviewResponse;
		expect(preview.invoice_lines_removable).toBe(false);
		expect(preview.invoice_lines_addable).toBe(true);
	},
);

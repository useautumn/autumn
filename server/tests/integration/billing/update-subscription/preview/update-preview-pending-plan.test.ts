/**
 * Previewing an update to a pending (unpaid) plan.
 *
 * Red (before): the preview ran the normal update path against the unpaid row, so
 * lowering a $1,200 pending plan to $1,000 showed a proration credit.
 * Green (after): the preview matches what billing.update does for a pending plan, a
 * fresh checkout at the full new price, and that is what the replacement session charges.
 */

import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { getStripeSessionId } from "@tests/integration/billing/attach/checkout/stripe-checkout/utils/longLivedCheckoutUtils";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("update preview pending plan: lowering the price previews the full new price")}`,
	async () => {
		const customerId = `update-preview-pending-price-down-${Date.now()}`;
		const pro = products.pro({
			id: "pro-preview-pending-price-down",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
			actions: [],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 1200 }) },
		});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 1000 }) },
		};

		const preview =
			await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		expect(preview.total).toBe(1000);
		expect(
			preview.line_items.filter(
				(lineItem: { total: number }) => lineItem.total < 0,
			),
		).toHaveLength(0);

		const result =
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		const replacementSession = await ctx.stripeCli.checkout.sessions.retrieve(
			getStripeSessionId(result.payment_url),
		);
		expect(replacementSession.amount_total).toBe(100_000);
	},
);

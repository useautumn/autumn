/**
 * Patch-style customize previews render the patched plan as `incoming`.
 *
 * Contract under test:
 *   - A PATCH-style customize (price / add_items / remove_items) keeps the
 *     existing customer product and carries the change as a patch. The
 *     preview's `incoming[0].plan` must reflect that patch, while
 *     `outgoing[0].plan` keeps the pre-patch terms.
 *
 * Pre-fix red: `billingPlanToChanges` ignored `patchCustomerProducts`, so the
 * incoming plan rendered the old price and items (identical to outgoing) even
 * though the line items already reflected the new terms.
 */

import { expect, test } from "bun:test";
import {
	type BillingPreviewChange,
	UpdateSubscriptionPreviewIntent,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const CATALOG_INCLUDED = 100;
const CUSTOM_INCLUDED = 250;
const CATALOG_PRICE = 20;
const CUSTOM_PRICE = 50;

const PREVIEW_EXPAND = ["incoming.plan", "outgoing.plan"];

type PreviewUpdateWithExpand = UpdateSubscriptionV1ParamsInput & {
	expand: string[];
};

const messagesIncludedOf = (change: BillingPreviewChange | undefined) =>
	change?.plan?.items.find((item) => item.feature_id === TestFeature.Messages)
		?.included;

test.concurrent(
	`${chalk.yellowBright("preview patch: incoming plan reflects add/remove items on a free plan")}`,
	async () => {
		const customerId = "preview-patch-incoming-items";
		const plan = products.base({
			id: "preview-patch-incoming-items",
			items: [items.monthlyMessages({ includedUsage: CATALOG_INCLUDED })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const preview =
			await autumnV2_2.subscriptions.previewUpdate<PreviewUpdateWithExpand>({
				customer_id: customerId,
				plan_id: plan.id,
				expand: PREVIEW_EXPAND,
				customize: {
					remove_items: [{ feature_id: TestFeature.Messages }],
					add_items: [itemsV2.monthlyMessages({ included: CUSTOM_INCLUDED })],
				},
			});

		expect(preview.intent).toBe(UpdateSubscriptionPreviewIntent.UpdatePlan);
		expect(preview.incoming).toHaveLength(1);
		expect(preview.outgoing).toHaveLength(1);
		expect(messagesIncludedOf(preview.incoming[0])).toBe(CUSTOM_INCLUDED);
		expect(messagesIncludedOf(preview.outgoing[0])).toBe(CATALOG_INCLUDED);
	},
);

test.concurrent(
	`${chalk.yellowBright("preview patch: incoming plan reflects price and item changes")}`,
	async () => {
		const customerId = "preview-patch-incoming-price";
		const pro = products.pro({
			id: "preview-patch-incoming-price",
			items: [
				items.monthlyMessages({ includedUsage: CATALOG_INCLUDED }),
				items.monthlyPrice({ price: CATALOG_PRICE }),
			],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const preview =
			await autumnV2_2.subscriptions.previewUpdate<PreviewUpdateWithExpand>({
				customer_id: customerId,
				plan_id: pro.id,
				expand: PREVIEW_EXPAND,
				customize: {
					price: itemsV2.monthlyPrice({ amount: CUSTOM_PRICE }),
					remove_items: [{ feature_id: TestFeature.Messages }],
					add_items: [itemsV2.monthlyMessages({ included: CUSTOM_INCLUDED })],
				},
			});

		expect(preview.intent).toBe(UpdateSubscriptionPreviewIntent.UpdatePlan);
		expect(preview.incoming).toHaveLength(1);
		expect(preview.outgoing).toHaveLength(1);

		expect(preview.incoming[0]?.plan?.price?.amount).toBe(CUSTOM_PRICE);
		expect(messagesIncludedOf(preview.incoming[0])).toBe(CUSTOM_INCLUDED);

		expect(preview.outgoing[0]?.plan?.price?.amount).toBe(CATALOG_PRICE);
		expect(messagesIncludedOf(preview.outgoing[0])).toBe(CATALOG_INCLUDED);

		expect(preview.next_cycle?.total).toBe(CUSTOM_PRICE);
	},
);

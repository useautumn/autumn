/**
 * Attaching a plan with `customize.billing_controls` snapshots the overridden
 * billing controls onto the customer_products row.
 *
 * Contract under test:
 *   - customize.billing_controls on attach is written to the customer product's
 *     billing-control columns (spend_limits, etc.).
 *   - A plan with no override but with plan-level controls still snapshots the
 *     plan's controls onto the customer product.
 *
 * Implementation surface:
 *   server/src/internal/billing/v2/setup/applyCustomizeBillingControls.ts
 *   server/src/internal/billing/v2/actions/attach/setup/setupAttachProductContext.ts
 *   server/src/internal/billing/v2/utils/initFullCustomerProduct/initCustomerProduct.ts
 */

import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

test.concurrent(
	`${chalk.yellowBright("customize.billing_controls → snapshotted onto customer product")}`,
	async () => {
		const customerId = "customize-billing-controls";

		const proPlan = products.pro({
			id: "pro-customize-controls",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: proPlan.id,
			customize: {
				billing_controls: {
					spend_limits: [
						{
							feature_id: TestFeature.Messages,
							enabled: true,
							overage_limit: 20,
						},
					],
				},
			},
		};

		await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});

		const cusProduct = fullCustomer.customer_products[0];

		expect(cusProduct.spend_limits).toEqual([
			{ feature_id: TestFeature.Messages, enabled: true, overage_limit: 20 },
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("update subscription with billing-controls-only customize → applied, not rejected as identical")}`,
	async () => {
		const customerId = "update-billing-controls";

		const proPlan = products.pro({
			id: "pro-update-controls",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [s.billing.attach({ productId: proPlan.id })],
		});

		// Billing controls only — no item/price change. Must NOT be rejected as
		// "identical to the current subscription". Uses the V0 (top-level
		// billing_controls) shape that the dashboard sends.
		await autumnV1.subscriptions.update<UpdateSubscriptionV0Params>({
			customer_id: customerId,
			product_id: proPlan.id,
			billing_controls: {
				spend_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						overage_limit: 50,
					},
				],
			},
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});

		const cusProduct = fullCustomer.customer_products[0];

		expect(cusProduct.spend_limits).toEqual([
			{ feature_id: TestFeature.Messages, enabled: true, overage_limit: 50 },
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("update subscription with unchanged items + new billing control → applied, not identical")}`,
	async () => {
		const customerId = "update-billing-controls-with-items";

		const proPlan = products.pro({
			id: "pro-update-controls-items",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [s.billing.attach({ productId: proPlan.id })],
		});

		// Mirrors the dashboard: it always sends the full (unchanged) items array
		// alongside the billing-control change, and previews before updating.
		// itemsSame must NOT short-circuit the billing-control change into
		// "identical" — neither in preview nor in the real update.
		const updateParams: UpdateSubscriptionV0Params = {
			customer_id: customerId,
			product_id: proPlan.id,
			items: [itemsV2.monthlyMessages({ included: 100 })],
			billing_controls: {
				auto_topups: [
					{
						feature_id: TestFeature.AiCredits,
						enabled: true,
						threshold: 10,
						quantity: 20,
					},
				],
			},
		};

		await autumnV1.subscriptions.previewUpdate<UpdateSubscriptionV0Params>(
			updateParams,
		);
		await autumnV1.subscriptions.update<UpdateSubscriptionV0Params>(
			updateParams,
		);

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});

		const cusProduct = fullCustomer.customer_products[0];

		expect(cusProduct.auto_topups).toEqual([
			{
				feature_id: TestFeature.AiCredits,
				enabled: true,
				threshold: 10,
				quantity: 20,
			},
		]);
	},
);

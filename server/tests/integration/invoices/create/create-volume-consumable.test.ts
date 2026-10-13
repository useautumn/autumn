/**
 * invoices.create bills a usage quantity on a pay-per-use volume price at the band
 * the whole quantity lands in, whether the price comes from the catalog or from
 * customize.items. Each case checks a preview-only call, the created invoice's
 * preview and the Stripe invoice all agree.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	type CreateInvoiceParamsInput,
	TierBehavior,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	createInvoice,
	expectCreatedInvoiceCorrect,
} from "./utils/expectCreatedInvoiceCorrect";
import { expectStripeInvoiceMatchesPreview } from "./utils/fuzz/expectInvoiceMatchesOracle";

type PlanParams = NonNullable<CreateInvoiceParamsInput["plans"]>[number];

const runVolumeInvoice = async ({
	customerId,
	planItems,
	plan,
	featureId,
	quantity,
	expectedAmount,
}: {
	customerId: string;
	planItems: Parameters<typeof products.base>[0]["items"];
	plan: Omit<PlanParams, "plan_id" | "feature_quantities">;
	featureId: string;
	quantity: number;
	expectedAmount: number;
}) => {
	const base = products.base({ id: `${customerId}-plan`, items: planItems });
	const { ctx, autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	const params: CreateInvoiceParamsInput = {
		customer_id: customerId,
		plans: [
			{
				plan_id: base.id,
				...plan,
				feature_quantities: [
					{
						feature_id: featureId,
						billing_behavior: BillingMethod.UsageBased,
						quantity,
					},
				],
			},
		],
	};

	const previewOnly = await createInvoice({
		autumnV2_3,
		params: { ...params, preview: true },
	});
	expect(previewOnly.invoice).toBeNull();
	expect(previewOnly.preview.total).toBeCloseTo(expectedAmount, 2);

	const response = await createInvoice({ autumnV2_3, params });
	expect(response.preview.total).toBeCloseTo(previewOnly.preview.total, 2);
	await expectCreatedInvoiceCorrect({
		ctx,
		response,
		lines: [{ amount: expectedAmount, quantity, prorated: false }],
		total: expectedAmount,
	});
	await expectStripeInvoiceMatchesPreview({ ctx, response });
};

test.concurrent(
	`${chalk.yellowBright("invoices.create volume consumable 1: catalog price, 800 units → band 2: 800 × $0.05 = $40")}`,
	async () => {
		// All 800 units at band 2's $0.05; graduated would be 500 × $0.10 + 300 × $0.05 = $65.
		await runVolumeInvoice({
			customerId: "inv-create-volume-catalog-band2",
			planItems: [items.volumeConsumableMessages()],
			plan: {},
			featureId: TestFeature.Messages,
			quantity: 800,
			expectedAmount: 40,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create volume consumable 2: catalog price with flat_amount, 300 units → band 1: 300 × $0.02 + $10 = $16")}`,
	async () => {
		// 300 × $0.02 + band 1's $10 flat fee = $16.
		await runVolumeInvoice({
			customerId: "inv-create-volume-catalog-flat",
			planItems: [
				items.volumeConsumableMessages({
					tiers: [
						{ to: 500, amount: 0.02, flat_amount: 10 },
						{ to: "inf", amount: 0.01, flat_amount: 25 },
					],
				}),
			],
			plan: {},
			featureId: TestFeature.Messages,
			quantity: 300,
			expectedAmount: 16,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create volume consumable 3: customize.items volume price, 20 units → band 2: 20 × $0.50 = $10")}`,
	async () => {
		// All 20 units at band 2's $0.50; graduated would be 10 × $1 + 10 × $0.50 = $15.
		await runVolumeInvoice({
			customerId: "inv-create-volume-customize",
			planItems: [],
			plan: {
				customize: {
					items: [
						{
							feature_id: TestFeature.Words,
							price: {
								billing_method: BillingMethod.UsageBased,
								interval: BillingInterval.Month,
								billing_units: 1,
								tier_behavior: TierBehavior.VolumeBased,
								tiers: [
									{ to: 10, amount: 1 },
									{ to: "inf", amount: 0.5 },
								],
							},
						},
					],
				},
			},
			featureId: TestFeature.Words,
			quantity: 20,
			expectedAmount: 10,
		});
	},
);

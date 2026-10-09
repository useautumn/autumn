/**
 * Tiered usage is billed as one Stripe invoice line per band (quantity × rate), with a
 * volume tier's flat fee on its own line, and the upcoming-invoice preview lists the
 * same lines. Every case advances one cycle and compares the renewal invoice to the preview.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
	type LimitedItem,
} from "@autumn/shared";
import {
	type ExpectedUsageInvoiceLine,
	expectRenewalUsageLinesMatchPreview,
	expectStripeUsageLines,
} from "@tests/integration/billing/utils/expectRenewalUsageLinesMatchPreview";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem";

const runRenewal = async ({
	customerId,
	item,
	tracks,
	expectedLines,
}: {
	customerId: string;
	item: LimitedItem;
	tracks: { featureId: string; value: number }[];
	expectedLines: (productName: string) => ExpectedUsageInvoiceLine[];
}) => {
	const pro = products.pro({ id: customerId, items: [item] });

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			...tracks.map(({ featureId, value }) =>
				s.track({ featureId, value, timeout: 3000 }),
			),
		],
	});

	await expectRenewalUsageLinesMatchPreview({
		ctx: scenario.ctx,
		autumnV1: scenario.autumnV1,
		autumnV2_2: scenario.autumnV2_2,
		customerId,
		testClockId: scenario.testClockId!,
		advancedTo: scenario.advancedTo,
		expectedLines: expectedLines(pro.name),
	});
};

test.concurrent(
	`${chalk.yellowBright("tier-lines 1: volume, 100 included, used 150 → one line 150 × $0.50 = $75")}`,
	async () => {
		// Net tiers 0–40 / 41+ are total-usage tiers 101–140 / 141+ once 100 are included.
		await runRenewal({
			customerId: "tier-lines-volume",
			item: items.volumeConsumableMessages({
				includedUsage: 100,
				tiers: [
					{ to: 40, amount: 1 },
					{ to: "inf", amount: 0.5 },
				],
			}),
			tracks: [{ featureId: TestFeature.Messages, value: 150 }],
			expectedLines: (productName) => [
				{
					description: `${productName} · Messages — 150 @ $0.50 (volume tier 141+)`,
					amount: 75,
					quantity: 150,
					unitAmountDecimal: "50",
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-lines 2: graduated, used 800 → 500 × $0.10 + 300 × $0.05")}`,
	async () => {
		await runRenewal({
			customerId: "tier-lines-graduated",
			item: items.tieredConsumableMessages(),
			tracks: [{ featureId: TestFeature.Messages, value: 800 }],
			expectedLines: (productName) => [
				{
					description: `${productName} · Messages — 500 @ $0.10 (tier 1–500)`,
					amount: 50,
					quantity: 500,
					unitAmountDecimal: "10",
				},
				{
					description: `${productName} · Messages — 300 @ $0.05 (tier 501+)`,
					amount: 15,
					quantity: 300,
					unitAmountDecimal: "5",
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-lines 3: volume flat_amount, used 800 → 800 × $0.05 + a $25 tier fee line")}`,
	async () => {
		await runRenewal({
			customerId: "tier-lines-volume-flat",
			item: items.volumeConsumableMessages({
				tiers: [
					{ to: 500, amount: 0.1, flat_amount: 10 },
					{ to: "inf", amount: 0.05, flat_amount: 25 },
				],
			}),
			tracks: [{ featureId: TestFeature.Messages, value: 800 }],
			expectedLines: (productName) => [
				{
					description: `${productName} · Messages — 800 @ $0.05 (volume tier 501+)`,
					amount: 40,
					quantity: 800,
					unitAmountDecimal: "5",
				},
				{
					description: `${productName} · Messages — volume tier 501+ flat fee`,
					amount: 25,
					quantity: 1,
					unitAmountDecimal: "2500",
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-lines 4: graduated credit system, 500 action1 = 100 credits → 50 × $0.10 + 50 × $0.05")}`,
	async () => {
		await runRenewal({
			customerId: "tier-lines-credits",
			item: constructArrearItem({
				featureId: TestFeature.Credits,
				includedUsage: 0,
				billingUnits: 1,
				tiers: [
					{ to: 50, amount: 0.1 },
					{ to: "inf", amount: 0.05 },
				],
			}) as LimitedItem,
			tracks: [{ featureId: TestFeature.Action1, value: 500 }],
			expectedLines: (productName) => [
				{
					description: `${productName} · Credits — 50 @ $0.10 (tier 1–50)`,
					amount: 5,
					quantity: 50,
					unitAmountDecimal: "10",
				},
				{
					description: `${productName} · Credits — 50 @ $0.05 (tier 51+)`,
					amount: 2.5,
					quantity: 50,
					unitAmountDecimal: "5",
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-lines 5: invoice credits keep their per-source lines and the credits-applied line")}`,
	async () => {
		await runRenewal({
			customerId: "tier-lines-invoice-credits",
			item: items.consumable({
				featureId: TestFeature.InvoiceCredits,
				includedUsage: 100,
				price: 1,
			}),
			tracks: [
				{ featureId: TestFeature.Action1, value: 250 },
				{ featureId: TestFeature.Action2, value: 250 },
			],
			expectedLines: () => [
				// The preview reports a credit source's units; Stripe bills it as 1 × amount.
				{
					description: "Action1, 250 units",
					amount: 50,
					quantity: 1,
					previewQuantity: 250,
				},
				{
					description: "Action2, 250 units",
					amount: 150,
					quantity: 1,
					previewQuantity: 250,
				},
				{ description: "Credits applied", amount: -100, quantity: 1 },
			],
		});
	},
);

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("tier-lines 6: threshold settlement describes the 50 units charged, not starting balance + 50")}`,
	async () => {
		const planId = `tier_lines_threshold_${Math.random().toString(36).slice(2, 9)}`;
		const planName = "Threshold lines";
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: planName,
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					price: {
						amount: 0.5,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
					},
					threshold_billing: { threshold: 50 },
				},
			],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: `tier-lines-threshold-${Math.random().toString(36).slice(2, 8)}`,
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: planId,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 160,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const invoices = await pollUntil({
			fetch: () =>
				ctx.stripeCli.invoices.list({
					customer: customer.stripe_id as string,
				}),
			until: ({ data }) =>
				data.some(
					(invoice) =>
						invoice.metadata?.autumn_action_source === "threshold_billing",
				),
			timeoutMs: 60_000,
		});
		const settlementInvoice = invoices.data.find(
			(invoice) =>
				invoice.metadata?.autumn_action_source === "threshold_billing",
		);
		expect(settlementInvoice?.total).toBe(2500);

		expectStripeUsageLines({
			stripeLines: settlementInvoice!.lines.data,
			expectedLines: [
				{
					description: `${planName} · Messages — 50 @ $0.50`,
					amount: 25,
					quantity: 50,
					unitAmountDecimal: "50",
				},
			],
		});
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("tier-lines 7: bands that split a billing-units pack bill 1 × the exact total, rate in the description")}`,
	async () => {
		// 250 used rounds to 3 packs; the 150-unit tier boundary leaves 1.5 packs per band.
		await runRenewal({
			customerId: "tier-lines-fallback",
			item: items.tieredConsumableMessages({
				billingUnits: 100,
				tiers: [
					{ to: 150, amount: 5 },
					{ to: "inf", amount: 3 },
				],
			}),
			tracks: [{ featureId: TestFeature.Messages, value: 250 }],
			expectedLines: (productName) => [
				{
					description: `${productName} · Messages — 150 @ $5.00 per 100 (tier 1–150)`,
					amount: 7.5,
					quantity: 1,
					unitAmountDecimal: "750",
				},
				{
					description: `${productName} · Messages — 150 @ $3.00 per 100 (tier 151+)`,
					amount: 4.5,
					quantity: 1,
					unitAmountDecimal: "450",
				},
			],
		});
	},
);

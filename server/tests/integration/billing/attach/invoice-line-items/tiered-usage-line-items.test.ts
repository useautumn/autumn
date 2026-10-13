/**
 * Tiered usage is billed as one Stripe invoice line per price. A volume line names the overage and the
 * tier it lands in (total-usage positions); every line goes to Stripe as 1 × total, as on dev.
 * Every case advances one cycle and compares the renewal invoice to the preview.
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
	`${chalk.yellowBright("tier-lines 1: volume, 100 included, used 150 → one line, 50 over @ $0.50 = $25")}`,
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
					description: `${productName} - Messages: 50 @ $0.50 (volume tier 141+)`,
					amount: 25,
					quantity: 1,
					previewQuantity: 150,
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-lines 2: graduated, used 800 → one line, 1 × $65 as on dev")}`,
	async () => {
		await runRenewal({
			customerId: "tier-lines-graduated",
			item: items.tieredConsumableMessages(),
			tracks: [{ featureId: TestFeature.Messages, value: 800 }],
			expectedLines: (productName) => [
				{
					description: `${productName} - 800 Messages`,
					amount: 65,
					quantity: 1,
					previewQuantity: 800,
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-lines 3: volume flat_amount, used 800 → one 1 × $65 line naming the rate and fee")}`,
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
					description: `${productName} - Messages: 800 @ $0.05 + $25.00 flat (volume tier 501+)`,
					amount: 65,
					quantity: 1,
					previewQuantity: 800,
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-lines 4: graduated credit system, 500 action1 = 100 credits → one $7.50 line as on dev")}`,
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
					description: `${productName} - 100 Credits`,
					amount: 7.5,
					quantity: 1,
					previewQuantity: 100,
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

test.concurrent(
	`${chalk.yellowBright("tier-lines 7: graduated billing units, 250 used → one line as on dev")}`,
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
					description: `${productName} - `,
					amount: 12,
					quantity: 1,
					previewQuantity: 250,
				},
			],
		});
	},
);

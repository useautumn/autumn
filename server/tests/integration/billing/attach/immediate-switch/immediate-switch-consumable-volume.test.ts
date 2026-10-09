/**
 * Upgrading off a plan with pay-per-use volume tiers bills its arrear usage at the
 * switch on the band total usage lands in. Each case checks billing.previewAttach
 * against the Stripe invoice the upgrade creates, line by line.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const toCents = (amount: number) => Math.round(amount * 100);

const runVolumeUpgrade = async ({
	customerId,
	proIncludedUsage,
	usage,
	advanceDays,
	expectedUsageAmount,
}: {
	customerId: string;
	proIncludedUsage: number;
	usage: number;
	advanceDays?: number;
	expectedUsageAmount: number;
}) => {
	const pro = products.pro({
		id: `${customerId}-pro`,
		items: [
			items.volumeConsumableMessages({ includedUsage: proIncludedUsage }),
		],
	});
	const premium = products.premium({
		id: `${customerId}-premium`,
		items: [items.volumeConsumableMessages({ includedUsage: 500 })],
	});

	const { ctx, autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: usage, timeout: 3000 }),
			...(advanceDays ? [s.advanceTestClock({ days: advanceDays })] : []),
		],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	const usageLines = preview.line_items.filter(
		(lineItem: { feature_id: string | null }) =>
			lineItem.feature_id === TestFeature.Messages,
	);
	expect(usageLines).toHaveLength(1);
	expect(usageLines[0].subtotal).toBeCloseTo(expectedUsageAmount, 2);

	const proratedBaseDiff = await calculateProratedDiff({
		customerId,
		advancedTo,
		oldAmount: 20,
		newAmount: 50,
	});
	expect(preview.total).toBeCloseTo(proratedBaseDiff + expectedUsageAmount, 0);

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});
	expect(result.invoice?.stripe_id).toBeDefined();

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice.stripe_id,
		{ expand: ["lines.data"] },
	);
	expect(stripeInvoice.total).toBe(toCents(preview.total));

	const stripeLineCents = stripeInvoice.lines.data
		.map((line) => line.amount)
		.filter((amount) => amount !== 0)
		.sort((a, b) => a - b);
	const previewLineCents = preview.line_items
		.map((lineItem: { subtotal: number }) => toCents(lineItem.subtotal))
		.filter((amount: number) => amount !== 0)
		.sort((a: number, b: number) => a - b);
	expect(stripeLineCents).toEqual(previewLineCents);

	const stripeUsageLine = stripeInvoice.lines.data.find(
		(line) =>
			line.metadata?.autumn_product_id === pro.id &&
			line.amount === toCents(expectedUsageAmount),
	);
	expect(stripeUsageLine).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});
};

test.concurrent(
	`${chalk.yellowBright("immediate-switch-consumable-volume 1: 100 included, 700 used → band 2 on total: 700 × $0.05 = $35 at the switch")}`,
	async () => {
		// Net tiers 0-500/501+ are total-usage bands 0-600/601+ once 100 are included.
		await runVolumeUpgrade({
			customerId: "imm-switch-cons-volume-band2",
			proIncludedUsage: 100,
			usage: 700,
			expectedUsageAmount: 35,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("immediate-switch-consumable-volume 2: mid-cycle, no included, 300 used → 300 × $0.10 = $30, not prorated")}`,
	async () => {
		// 300 × $0.10 = $30 in band 1; only the base difference is prorated.
		await runVolumeUpgrade({
			customerId: "imm-switch-cons-volume-midcycle",
			proIncludedUsage: 0,
			usage: 300,
			advanceDays: 15,
			expectedUsageAmount: 30,
		});
	},
);

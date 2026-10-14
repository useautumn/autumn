import { test } from "bun:test";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const runVolumeRenewal = async ({
	customerId,
	includedUsage = 0,
	billingUnits,
	tiers,
	usage,
	expectedUsageAmount,
}: {
	customerId: string;
	includedUsage?: number;
	billingUnits?: number;
	tiers?: { to: number | "inf"; amount: number; flat_amount?: number }[];
	usage: number;
	expectedUsageAmount: number;
}) => {
	const volumeItem = items.volumeConsumableMessages({
		includedUsage,
		billingUnits,
		tiers,
	});
	const pro = products.pro({ id: customerId, items: [volumeItem] });

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			...(usage > 0
				? [
						s.track({
							featureId: TestFeature.Messages,
							value: usage,
							timeout: 3000,
						}),
					]
				: []),
		],
	});

	await expectNextInvoiceMatchesPreview({
		ctx: scenario.ctx,
		autumnV1: scenario.autumnV1,
		autumnV2_2: scenario.autumnV2_2,
		customerId,
		testClockId: scenario.testClockId!,
		advancedTo: scenario.advancedTo,
		featureId: TestFeature.Messages,
		expectedFeatureAmount: expectedUsageAmount,
	});
};

test.concurrent(
	`${chalk.yellowBright("consumable-volume 1: band 1, no included: 300 × $0.10 = $30")}`,
	async () => {
		await runVolumeRenewal({
			customerId: "cons-volume-band1",
			usage: 300,
			expectedUsageAmount: 30,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("consumable-volume 2: band 2, no included: all 800 × $0.05 = $40 (graduated would be $65)")}`,
	async () => {
		await runVolumeRenewal({
			customerId: "cons-volume-band2",
			usage: 800,
			expectedUsageAmount: 40,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("consumable-volume 3: 100 included, used 100 → $0")}`,
	async () => {
		await runVolumeRenewal({
			customerId: "cons-volume-at-included",
			includedUsage: 100,
			usage: 100,
			expectedUsageAmount: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("consumable-volume 4: 100 included, used 150 → only the 50 over: 50 × $0.10 = $5")}`,
	async () => {
		await runVolumeRenewal({
			customerId: "cons-volume-above-included",
			includedUsage: 100,
			usage: 150,
			expectedUsageAmount: 5,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("consumable-volume 5: 100 included, used 700 → 600 over in net band 2: 600 × $0.05 = $30")}`,
	async () => {
		await runVolumeRenewal({
			customerId: "cons-volume-included-band2",
			includedUsage: 100,
			usage: 700,
			expectedUsageAmount: 30,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("consumable-volume 6: billing units of 100: 250 used → 3 packs × $5 = $15")}`,
	async () => {
		await runVolumeRenewal({
			customerId: "cons-volume-billing-units",
			billingUnits: 100,
			tiers: [
				{ to: 500, amount: 5 },
				{ to: "inf", amount: 3 },
			],
			usage: 250,
			expectedUsageAmount: 15,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("consumable-volume 7: flat_amount, 100 included: used 100 → $0")}`,
	async () => {
		await runVolumeRenewal({
			customerId: "cons-volume-flat-at-included",
			includedUsage: 100,
			tiers: [
				{ to: 500, amount: 0, flat_amount: 10 },
				{ to: "inf", amount: 0, flat_amount: 25 },
			],
			usage: 100,
			expectedUsageAmount: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("consumable-volume 8: flat_amount, 100 included: used 300 → 200 over in net tier 1 → fee $10")}`,
	async () => {
		await runVolumeRenewal({
			customerId: "cons-volume-flat-band1",
			includedUsage: 100,
			tiers: [
				{ to: 500, amount: 0, flat_amount: 10 },
				{ to: "inf", amount: 0, flat_amount: 25 },
			],
			usage: 300,
			expectedUsageAmount: 10,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("consumable-volume 9: flat_amount, no included, no usage → $0 (no tier-1 fee)")}`,
	async () => {
		await runVolumeRenewal({
			customerId: "cons-volume-flat-zero",
			tiers: [
				{ to: 500, amount: 0, flat_amount: 10 },
				{ to: "inf", amount: 0, flat_amount: 25 },
			],
			usage: 0,
			expectedUsageAmount: 0,
		});
	},
);

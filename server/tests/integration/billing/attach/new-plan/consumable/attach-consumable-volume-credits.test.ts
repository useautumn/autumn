import { test } from "bun:test";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const runCreditsVolumeRenewal = async ({
	customerId,
	includedUsage,
	tracks,
	expectedUsageAmount,
}: {
	customerId: string;
	includedUsage: number;
	tracks: { featureId: TestFeature; value: number }[];
	expectedUsageAmount: number;
}) => {
	const pro = products.pro({
		id: `${customerId}-pro`,
		items: [
			items.volumeConsumable({ featureId: TestFeature.Credits, includedUsage }),
		],
	});

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

	await expectNextInvoiceMatchesPreview({
		ctx: scenario.ctx,
		autumnV1: scenario.autumnV1,
		autumnV2_2: scenario.autumnV2_2,
		customerId,
		testClockId: scenario.testClockId!,
		advancedTo: scenario.advancedTo,
		featureId: TestFeature.Credits,
		expectedFeatureAmount: expectedUsageAmount,
	});
};

test.concurrent(
	`${chalk.yellowBright("consumable-volume-credits 1: no included, 800 credits from two actions → band 2: 800 × $0.05 = $40")}`,
	async () => {
		await runCreditsVolumeRenewal({
			customerId: "cons-volume-credits-band2",
			includedUsage: 0,
			tracks: [
				{ featureId: TestFeature.Action1, value: 1000 },
				{ featureId: TestFeature.Action2, value: 1000 },
			],
			expectedUsageAmount: 40,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("consumable-volume-credits 2: 100 included, 150 credits → only the 50 over: 50 × $0.10 = $5")}`,
	async () => {
		await runCreditsVolumeRenewal({
			customerId: "cons-volume-credits-included",
			includedUsage: 100,
			tracks: [{ featureId: TestFeature.Action2, value: 250 }],
			expectedUsageAmount: 5,
		});
	},
);

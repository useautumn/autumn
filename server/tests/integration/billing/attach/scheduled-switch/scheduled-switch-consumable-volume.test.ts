import { expect, test } from "bun:test";
import { type ApiCustomerV3, sumValues } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const PRO_BASE = 20;

const runVolumeDowngrade = async ({
	customerId,
	usage,
	expectedUsageAmount,
}: {
	customerId: string;
	usage: number;
	expectedUsageAmount: number;
}) => {
	const premium = products.premium({
		id: `${customerId}-premium`,
		items: [items.volumeConsumableMessages({ includedUsage: 100 })],
	});
	const pro = products.pro({
		id: `${customerId}-pro`,
		items: [items.volumeConsumableMessages({ includedUsage: 50 })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.track({ featureId: TestFeature.Messages, value: usage, timeout: 3000 }),
			s.billing.attach({ productId: pro.id }),
		],
	});

	const { preview, renewalInvoice } = await expectNextInvoiceMatchesPreview({
		ctx: scenario.ctx,
		autumnV1: scenario.autumnV1,
		autumnV2_2: scenario.autumnV2_2,
		customerId,
		testClockId: scenario.testClockId!,
		advancedTo: scenario.advancedTo,
	});

	const usageSubtotal = sumValues(
		preview.line_items
			.filter((lineItem) => lineItem.feature_id === TestFeature.Messages)
			.map((lineItem) => lineItem.subtotal),
	);
	expect(usageSubtotal).toBeCloseTo(expectedUsageAmount, 2);
	expect(preview.total).toBeCloseTo(PRO_BASE + expectedUsageAmount, 2);
	expect(renewalInvoice.total).toBeCloseTo(PRO_BASE + expectedUsageAmount, 2);

	const customer =
		await scenario.autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 50,
		usage: 0,
	});
};

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-consumable-volume 1: premium 100 included, 700 used → 600 over in net band 2: 600 × $0.05 = $30 + pro $20")}`,
	async () => {
		await runVolumeDowngrade({
			customerId: "sched-switch-cons-volume-band2",
			usage: 700,
			expectedUsageAmount: 30,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-consumable-volume 2: premium 100 included, 150 used → only the 50 over: 50 × $0.10 = $5 + pro $20")}`,
	async () => {
		await runVolumeDowngrade({
			customerId: "sched-switch-cons-volume-band1",
			usage: 150,
			expectedUsageAmount: 5,
		});
	},
);

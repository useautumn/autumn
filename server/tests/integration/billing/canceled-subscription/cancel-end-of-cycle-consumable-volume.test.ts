import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const runVolumeCancelEndOfCycle = async ({
	customerId,
	includedUsage,
	usage,
	expectedUsageAmount,
}: {
	customerId: string;
	includedUsage: number;
	usage: number;
	expectedUsageAmount: number;
}) => {
	const pro = products.pro({
		id: `${customerId}-pro`,
		items: [items.volumeConsumableMessages({ includedUsage })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: usage, timeout: 3000 }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	const { preview, renewalInvoice } = await expectNextInvoiceMatchesPreview({
		ctx: scenario.ctx,
		autumnV1: scenario.autumnV1,
		autumnV2_2: scenario.autumnV2_2,
		customerId,
		testClockId: scenario.testClockId!,
		advancedTo: scenario.advancedTo,
		featureId: TestFeature.Messages,
		expectedFeatureAmount: expectedUsageAmount,
	});

	expect(preview.total).toBeCloseTo(expectedUsageAmount, 2);
	expect(renewalInvoice.total).toBeCloseTo(expectedUsageAmount, 2);

	const customer =
		await scenario.autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({ customer, productId: pro.id });
};

test.concurrent(
	`${chalk.yellowBright("cancel-end-of-cycle-consumable-volume 1: 100 included, 700 used → 600 over in net band 2: 600 × $0.05 = $30 final invoice")}`,
	async () => {
		await runVolumeCancelEndOfCycle({
			customerId: "cancel-eoc-cons-volume-band2",
			includedUsage: 100,
			usage: 700,
			expectedUsageAmount: 30,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cancel-end-of-cycle-consumable-volume 2: no included, 300 used → band 1: 300 × $0.10 = $30 final invoice")}`,
	async () => {
		await runVolumeCancelEndOfCycle({
			customerId: "cancel-eoc-cons-volume-band1",
			includedUsage: 0,
			usage: 300,
			expectedUsageAmount: 30,
		});
	},
);

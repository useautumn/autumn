import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("invoice.created skip-overage-billing 3: main plan + add-on with split allowance/price and per-plan controls")}`,
	async () => {
		const customerId = "inv-skip-ovg-addon-split";

		const mainPlan = products.pro({
			id: "main-pro",
			items: [
				items.monthlyWords({ includedUsage: 100 }),
				items.consumableMessages({ includedUsage: 100 }),
			],
			billingControls: {
				spend_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						overage_limit: 1000,
						skip_overage_billing: false,
					},
				],
			},
		});

		const wordsAddOn = products.recurringAddOn({
			id: "words-addon",
			items: [items.consumableWords({ includedUsage: 0 })],
			billingControls: {
				spend_limits: [
					{
						feature_id: TestFeature.Words,
						enabled: true,
						overage_limit: 1000,
						skip_overage_billing: true,
					},
				],
			},
		});

		const { autumnV1, autumnV2_1, testClockId, advancedTo, ctx } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [mainPlan, wordsAddOn] }),
				],
				actions: [
					s.attach({ productId: mainPlan.id, timeout: 2000 }),
					s.attach({ productId: wordsAddOn.id, timeout: 2000 }),
				],
			});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: 150,
		});
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 130,
		});
		await timeout(4000);

		const renewedAt = await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: advancedTo,
			withPause: true,
		});

		const customerAfterFirstCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerInvoiceCorrect({
			customer: customerAfterFirstCycle,
			count: 3,
			latestTotal: 20 + 20 + 30 * 0.1,
		});

		expect(customerAfterFirstCycle.features[TestFeature.Words].balance).toBe(
			100,
		);
		expect(customerAfterFirstCycle.features[TestFeature.Messages].balance).toBe(
			100,
		);

		await autumnV2_1.customers.update(customerId, {
			billing_controls: {
				spend_limits: [
					{
						feature_id: TestFeature.Words,
						enabled: true,
						overage_limit: 1000,
						skip_overage_billing: false,
					},
				],
			},
		});
		await timeout(3000);

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: 140,
		});
		await timeout(4000);

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: renewedAt,
			withPause: true,
		});

		const customerAfterSecondCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerInvoiceCorrect({
			customer: customerAfterSecondCycle,
			count: 4,
			latestTotal: 20 + 20 + 40 * 0.05,
		});

		expect(customerAfterSecondCycle.features[TestFeature.Words].balance).toBe(
			100,
		);
	},
);

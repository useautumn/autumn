import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("allocated v2 preview attach: base bills now and allocated usage is next-cycle usage")}`,
	async () => {
		const customerId = "preview-attach-allocated-v2";
		const pro = products.pro({
			id: "pro",
			items: [items.allocatedV2Users({ includedUsage: 2 })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const preview = await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(
			{
				customer_id: customerId,
				plan_id: pro.id,
			},
		);

		expect(preview.subtotal).toBe(20);
		expect(preview.total).toBe(20);
		expect(preview.line_items).toHaveLength(1);
		expect(preview.line_items[0]).toEqual(
			expect.objectContaining({
				plan_id: pro.id,
				feature_id: null,
				total: 20,
			}),
		);
		expect(preview.line_items).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ feature_id: TestFeature.Users }),
			]),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("allocated v2 preview update: base-price update excludes allocated overage from immediate total")}`,
	async () => {
		const customerId = "preview-update-allocated-v2";
		const pro = products.pro({
			id: "pro",
			items: [items.allocatedV2Users({ includedUsage: 2 })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
				}),
			],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 5,
		});
		await timeout(2000);
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 20,
		});

		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				{
					customer_id: customerId,
					plan_id: pro.id,
					customize: {
						price: itemsV2.monthlyPrice({ amount: 30 }),
					},
				},
		);

		expect(preview.total).toBe(10);
		expect(
			preview.line_items.reduce(
				(sum: number, lineItem: { total: number }) => sum + lineItem.total,
				0,
			),
		).toBe(10);
		expect(preview.line_items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					plan_id: pro.id,
					feature_id: null,
				}),
			]),
		);
		expect(preview.line_items).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ feature_id: TestFeature.Users }),
			]),
		);
		expect(preview.next_cycle?.total).toBe(30);
		expect(preview.next_cycle?.usage_line_items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					plan_id: pro.id,
					feature_id: TestFeature.Users,
				}),
			]),
		);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 5,
			planId: pro.id,
			nextResetAt: null,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 20,
		});
	},
);

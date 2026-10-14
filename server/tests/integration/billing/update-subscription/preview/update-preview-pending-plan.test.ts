import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	CusProductStatus,
	customers,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { getStripeSessionId } from "@tests/integration/billing/attach/checkout/stripe-checkout/utils/longLivedCheckoutUtils";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

test.concurrent(
	`${chalk.yellowBright("update preview pending plan: lowering the price previews the full new price")}`,
	async () => {
		const customerId = `update-preview-pending-price-down-${Date.now()}`;
		const pro = products.pro({
			id: "pro-preview-pending-price-down",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
			actions: [],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 1200 }) },
		});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 1000 }) },
		};

		const preview =
			await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		expect(preview.total).toBe(1000);
		expect(
			preview.line_items.filter(
				(lineItem: { total: number }) => lineItem.total < 0,
			),
		).toHaveLength(0);

		const result =
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		const replacementSession = await ctx.stripeCli.checkout.sessions.retrieve(
			getStripeSessionId(result.payment_url),
		);
		expect(replacementSession.amount_total).toBe(100_000);
	},
);

test.concurrent(
	`${chalk.yellowBright("update preview pending plan: an explicit customer_product_id previews that plan, not the pending one")}`,
	async () => {
		const customerId = `update-preview-pending-explicit-target-${Date.now()}`;
		const pro = products.pro({
			id: "pro-preview-explicit-target",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addOn = products.recurringAddOn({
			id: "addon-preview-explicit-target",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro, addOn] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({
					productId: addOn.id,
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: true,
				}),
			],
		});

		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		const activeRows = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: dbCustomer!.internal_id,
			inStatuses: [CusProductStatus.Active],
		});
		const proRow = activeRows.find((row) => row.product.id === pro.id);

		const preview =
			await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				{
					customer_id: customerId,
					customer_product_id: proRow!.id,
					customize: { price: itemsV2.monthlyPrice({ amount: 50 }) },
				},
			);
		expect(preview.line_items.length).toBeGreaterThan(0);
		expect(
			preview.line_items.every(
				(lineItem: { plan_id: string }) => lineItem.plan_id === pro.id,
			),
		).toBe(true);
	},
);

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Update Subscription Checkout - Custom plan decrease scenario
 *
 * Starts from a paid base plan, then previews an update-subscription checkout
 * that lowers the base price while keeping the same included features.
 */

test(`${chalk.yellowBright("update-subscription-checkout: custom plan reduce base price")}`, async () => {
	const customerId = "update-sub-checkout-custom-dec";

	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 30 }),
		],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	console.log("customer before custom plan decrease:", {
		products: customerBefore.products?.map((product) => ({
			id: product.id,
			name: product.name,
			status: product.status,
		})),
		features: {
			[TestFeature.Messages]: customerBefore.features?.[TestFeature.Messages],
		},
	});

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		redirect_mode: "always",
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
		},
	};

	const updatePreview =
		await autumnV2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
	console.log("custom plan decrease preview:", updatePreview);
	expect(updatePreview.total).toBe(-10);

	const updateResult =
		await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
	console.log("custom plan decrease result:", updateResult);
	expect(updateResult.payment_url).toBeTruthy();
});

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
 * Update Subscription Checkout - Custom plan increase scenario
 *
 * Starts from a paid base plan, then previews an update-subscription checkout
 * that raises the base price and adds a second included feature.
 */

test(`${chalk.yellowBright("update-subscription-checkout: custom plan increase base price + add feature")}`, async () => {
	const customerId = "update-sub-checkout-custom-inc";

	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
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
	console.log("customer before custom plan increase:", {
		products: customerBefore.products?.map((product) => ({
			id: product.id,
			name: product.name,
			status: product.status,
		})),
		features: {
			[TestFeature.Messages]: customerBefore.features?.[TestFeature.Messages],
			[TestFeature.Words]: customerBefore.features?.[TestFeature.Words],
		},
	});

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		redirect_mode: "always",
		customize: {
			price: itemsV2.monthlyPrice({ amount: 30 }),
			items: [itemsV2.monthlyWords({ included: 200 })],
		},
	};

	const updateResult =
		await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
	console.log("custom plan increase result:", updateResult);
	expect(updateResult.payment_url).toBeTruthy();
});

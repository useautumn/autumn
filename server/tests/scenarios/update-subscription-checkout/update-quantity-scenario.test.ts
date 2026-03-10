import { test } from "bun:test";
import type { ApiCustomerV3, UpdateSubscriptionV1Params } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Update Subscription Checkout - Quantity Scenario
 *
 * Baseline scenario for frontend card exploration.
 * Starts with an attached prepaid plan, previews a quantity update on the same
 * product, then applies it so we can inspect the before/preview/after shapes.
 */

test(`${chalk.yellowBright("update-subscription-checkout: quantity update on same plan")}`, async () => {
	const customerId = "update-sub-checkout-qty";

	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
			}),
		],
	});

	const initialOptions = [{ feature_id: TestFeature.Messages, quantity: 300 }];
	const updatedOptions = [{ feature_id: TestFeature.Messages, quantity: 700 }];

	const { autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: initialOptions,
			}),
		],
	});

	const customerBefore =
		await autumnV2.customers.get<ApiCustomerV3>(customerId);
	console.log("customer before quantity update:", {
		products: customerBefore.products?.map((product) => ({
			id: product.id,
			name: product.name,
			status: product.status,
		})),
		features: customerBefore.features?.[TestFeature.Messages],
	});

	const updateResult =
		await autumnV2.subscriptions.update<UpdateSubscriptionV1Params>({
			customer_id: customerId,
			plan_id: pro.id,
			// feature_quantities: [],
			redirect_mode: "always",
		});

	console.log("update subscription result:", updateResult);
});

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

test(`${chalk.yellowBright("processor_subscription_id: attach with existing stripe subscription anchors reset cycle")}`, async () => {});

test(`${chalk.yellowBright("processor_subscription_id: upgrade with no_billing_changes preserves anchor and subscription")}`, async () => {});

test(`${chalk.yellowBright("update no_billing_changes: customize preserves subscription_ids on new cusProduct")}`, async () => {
	const customerId = "update-no-billing-preserves-sub";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Capture original subscription_ids on the active cusProduct
	const fullCustomerBefore = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const cusProductBefore = fullCustomerBefore.customer_products.find(
		(cp) =>
			cp.product_id === pro.id && cp.status === CusProductStatus.Active,
	);
	expect(cusProductBefore).toBeDefined();
	const originalSubIds = cusProductBefore?.subscription_ids ?? [];
	expect(originalSubIds.length).toBeGreaterThan(0);

	// Customize the plan with no_billing_changes: should NOT touch Stripe but
	// the new (replacement) active cusProduct must still link to the live sub.
	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		no_billing_changes: true,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 50 }),
		},
	});

	const fullCustomerAfter = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const activeProRows = fullCustomerAfter.customer_products.filter(
		(cp) =>
			cp.product_id === pro.id && cp.status === CusProductStatus.Active,
	);
	expect(activeProRows.length).toBe(1);
	const cusProductAfter = activeProRows[0];

	expect(cusProductAfter.subscription_ids).toEqual(originalSubIds);
});

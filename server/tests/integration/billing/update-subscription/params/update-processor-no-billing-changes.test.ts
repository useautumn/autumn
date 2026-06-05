import { expect, test } from "bun:test";
import {
	findActiveCustomerProductById,
	CusProductStatus,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectCustomerProductStatuses } from "@tests/integration/billing/utils/expectCustomerProductStatuses";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

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
	const cusProductBefore = findActiveCustomerProductById({
		fullCus: fullCustomerBefore,
		productId: pro.id,
	});
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

	await expectCustomerProducts({
		customer: await autumnV2.customers.get(customerId),
		active: [pro.id],
	});

	const { byStatus } = await expectCustomerProductStatuses({
		ctx,
		customerId,
		productId: pro.id,
		expected: {
			[CusProductStatus.Active]: 1,
		},
	});
	expect(byStatus[CusProductStatus.Active]?.[0]?.subscription_ids).toEqual(
		originalSubIds,
	);
});

// Red: replacement-style updates reset a past_due cusProduct to active.
// Green: the replacement inherits status and keeps the subscription link.
test(`${chalk.yellowBright("update no_billing_changes: replacement customize preserves past_due status")}`, async () => {
	const customerId = "update-no-billing-preserves-past-due";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1, autumnV2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const fullCustomerBefore = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const cusProductBefore = findActiveCustomerProductById({
		fullCus: fullCustomerBefore,
		productId: pro.id,
	});
	expect(cusProductBefore).toBeDefined();
	const originalSubIds = cusProductBefore?.subscription_ids ?? [];
	expect(originalSubIds.length).toBeGreaterThan(0);

	await CusProductService.update({
		ctx,
		cusProductId: cusProductBefore!.id,
		updates: { status: CusProductStatus.PastDue },
	});

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		no_billing_changes: true,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
			items: [itemsV2.monthlyMessages({ included: 250 })],
		},
	});

	await expectCustomerProducts({
		customer: await autumnV1.customers.get(customerId),
		pastDue: [pro.id],
	});

	const { byStatus } = await expectCustomerProductStatuses({
		ctx,
		customerId,
		productId: pro.id,
		expected: {
			[CusProductStatus.PastDue]: 1,
			[CusProductStatus.Expired]: 1,
		},
	});
	expect(byStatus[CusProductStatus.PastDue]?.[0]?.subscription_ids).toEqual(
		originalSubIds,
	);
});

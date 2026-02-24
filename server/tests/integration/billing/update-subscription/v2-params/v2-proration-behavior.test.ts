import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	BillingInterval,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Proration Behavior: V2 Params Tests (Update Subscription)
 *
 * Tests for proration_behavior param in V1 API schema:
 * - 'prorate_immediately' (default): Invoice line items are charged immediately
 * - 'none': Skip proration charges, defer to next billing cycle
 *
 * These tests use the V1 API schema directly (UpdateSubscriptionV1ParamsInput).
 */

test.concurrent(`${chalk.yellowBright("v2-proration_behavior update: default prorate_immediately")}`, async () => {
	const customerId = "v2-update-prorate-default";
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const pro = products.base({ id: "pro", items: [prepaidItem] });

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features?.[TestFeature.Messages]?.balance).toBe(5);

	// Update without specifying proration_behavior (defaults to prorate_immediately)
	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 10 }],
	};

	const preview =
		await autumnV2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			params,
		);
	expect(preview.total).toBeGreaterThan(0);

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(10);

	// Proration invoice should be created
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
	});
});

test.concurrent(`${chalk.yellowBright("v2-proration_behavior update: prorate_immediately explicit")}`, async () => {
	const customerId = "v2-update-prorate-immediate";
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const pro = products.base({ id: "pro", items: [prepaidItem] });

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	// Update with explicit proration_behavior: prorate_immediately
	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 10 }],
		proration_behavior: "prorate_immediately",
	};

	const preview =
		await autumnV2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			params,
		);
	expect(preview.total).toBeGreaterThan(0);

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(10);

	// Proration invoice should be created
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
	});
});

test.concurrent(`${chalk.yellowBright("v2-proration_behavior update: none - no proration invoice")}`, async () => {
	const customerId = "v2-update-prorate-none";
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const pro = products.base({ id: "pro", items: [prepaidItem] });

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features?.[TestFeature.Messages]?.balance).toBe(5);

	const baseParams = {
		customer_id: customerId,
		plan_id: pro.id,
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 10 }],
	};

	// Preview WITHOUT proration_behavior shows what would normally be charged
	const previewNormal =
		await autumnV2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			baseParams,
		);
	expect(previewNormal.total).toBeGreaterThan(0);

	// Preview WITH proration_behavior: none shows 0 (nothing charged now)
	const previewNone =
		await autumnV2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			{
				...baseParams,
				proration_behavior: "none",
			},
		);
	expect(previewNone.total).toBe(0);

	// Update with proration_behavior: none
	const params: UpdateSubscriptionV1ParamsInput = {
		...baseParams,
		proration_behavior: "none",
	};

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Entitlements should be updated immediately
	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(10);

	// NO new invoice should be created (only initial attach invoice)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
	});
});

test.concurrent(`${chalk.yellowBright("v2-proration_behavior update: none with quantity decrease - no credit")}`, async () => {
	const customerId = "v2-update-prorate-none-decrease";
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const pro = products.base({ id: "pro", items: [prepaidItem] });

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
			}),
		],
	});

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features?.[TestFeature.Messages]?.balance).toBe(10);

	const baseParams = {
		customer_id: customerId,
		plan_id: pro.id,
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 5 }],
	};

	// Preview WITHOUT proration_behavior shows credit (negative total)
	const previewNormal =
		await autumnV2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			baseParams,
		);
	expect(previewNormal.total).toBeLessThan(0);

	// Preview WITH proration_behavior: none shows 0 (no credit applied now)
	const previewNone =
		await autumnV2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			{
				...baseParams,
				proration_behavior: "none",
			},
		);
	expect(previewNone.total).toBe(0);

	// Update with proration_behavior: none
	const params: UpdateSubscriptionV1ParamsInput = {
		...baseParams,
		proration_behavior: "none",
	};

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Entitlements should be updated immediately
	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(5);

	// NO new invoice should be created
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
	});
});

test.concurrent(`${chalk.yellowBright("v2-proration_behavior update: none with customize")}`, async () => {
	const customerId = "v2-update-prorate-none-customize";

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

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Update with customize and proration_behavior: none
	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			price: { amount: 40, interval: BillingInterval.Month },
		},
		proration_behavior: "none",
	};

	// Preview should show 0 (no proration)
	const preview =
		await autumnV2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			params,
		);
	expect(preview.total).toBe(0);

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Features should still be intact
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// NO new invoice should be created
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
	});
});

import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV1Input } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Proration Behavior: V2 Params Tests
 *
 * Tests for proration_behavior param in V1 API schema:
 * - 'prorate_immediately' (default): Invoice line items are charged immediately
 * - 'none': Skip proration charges, defer to next billing cycle
 *
 * These tests use the V1 API schema directly (AttachParamsV1Input).
 */

test.concurrent(`${chalk.yellowBright("v2-proration_behavior attach: default prorate_immediately")}`, async () => {
	const customerId = "v2-attach-prorate-default";

	const starter = products.base({
		id: "starter",
		items: [
			items.monthlyMessages({ includedUsage: 50 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 200 }),
			items.monthlyPrice({ price: 30 }),
		],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [starter, pro] }),
		],
		actions: [s.attach({ productId: starter.id })],
	});

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: starter.id,
	});
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: 10,
	});

	// Upgrade without specifying proration_behavior (defaults to prorate_immediately)
	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: pro.id,
		redirect_mode: "if_required",
	};

	const preview =
		await autumnV2.billing.previewAttach<AttachParamsV1Input>(params);
	expect(preview.total).toBeGreaterThan(0);

	await autumnV2.billing.attach<AttachParamsV1Input>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
	});
});

test.concurrent(`${chalk.yellowBright("v2-proration_behavior attach: prorate_immediately explicit")}`, async () => {
	const customerId = "v2-attach-prorate-immediate";

	const starter = products.base({
		id: "starter",
		items: [
			items.monthlyMessages({ includedUsage: 50 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 200 }),
			items.monthlyPrice({ price: 30 }),
		],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [starter, pro] }),
		],
		actions: [s.attach({ productId: starter.id })],
	});

	// Upgrade with explicit proration_behavior: prorate_immediately
	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: pro.id,
		redirect_mode: "if_required",
		proration_behavior: "prorate_immediately",
	};

	const preview =
		await autumnV2.billing.previewAttach<AttachParamsV1Input>(params);
	expect(preview.total).toBeGreaterThan(0);

	await autumnV2.billing.attach<AttachParamsV1Input>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});
});

test.concurrent(`${chalk.yellowBright("v2-proration_behavior attach: none - no proration invoice")}`, async () => {
	const customerId = "v2-attach-prorate-none";

	const starter = products.base({
		id: "starter",
		items: [
			items.monthlyMessages({ includedUsage: 50 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 200 }),
			items.monthlyPrice({ price: 30 }),
		],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [starter, pro] }),
		],
		actions: [s.attach({ productId: starter.id })],
	});

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: 10,
	});

	// Preview WITH proration_behavior: none shows 0 (nothing charged now)
	const previewNone = await autumnV2.billing.previewAttach<AttachParamsV1Input>(
		{
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
			proration_behavior: "none",
		},
	);
	expect(previewNone.total).toBe(0);

	// Preview WITHOUT proration_behavior shows what would normally be charged
	const previewNormal =
		await autumnV2.billing.previewAttach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});
	expect(previewNormal.total).toBeGreaterThan(0);

	// Upgrade with proration_behavior: none
	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: pro.id,
		redirect_mode: "if_required",
		proration_behavior: "none",
	};

	await autumnV2.billing.attach<AttachParamsV1Input>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Entitlements should be updated immediately
	await expectProductActive({ customer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// NO new invoice should be created (only initial attach invoice)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
	});
});

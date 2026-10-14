import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	applyProration,
	type LimitedItem,
	OnDecrease,
	OnIncrease,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";

test.concurrent(`${chalk.yellowBright("cancel immediately billing: base + prepaid (start of cycle)")}`, async () => {
	const customerId = "cancel-imm-billing-prepaid-start";

	const billingUnits = 100;
	const pricePerPack = 10;
	const initialQuantity = 300;

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
		],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});
	expect(customerAfterAttach.features[TestFeature.Messages].balance).toBe(
		initialQuantity,
	);

	const expectedInitialInvoice =
		20 + (initialQuantity / billingUnits) * pricePerPack;
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: expectedInitialInvoice,
	});

	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	expect(preview.total).toBeLessThan(0);
	expect(preview.total).toBeCloseTo(-expectedInitialInvoice, -1);
	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("cancel immediately billing: base + allocated (start of cycle)")}`, async () => {
	const customerId = "cancel-imm-billing-allocated-start";

	const allocatedSeats = 5;

	const allocatedItem = items.allocatedUsers({
		includedUsage: 0,
	});

	const pro = products.pro({
		id: "pro",
		items: [allocatedItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: allocatedSeats,
	});

	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterTrack,
		productId: pro.id,
	});
	expect(customerAfterTrack.features[TestFeature.Users].balance).toBe(
		-allocatedSeats,
	);

	expect(customerAfterTrack.invoices?.length).toBeGreaterThanOrEqual(1);

	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	expect(preview.total).toBeLessThan(0);

	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	expect(customerAfterCancel.invoices?.[0]?.total).toBe(preview.total);

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("cancel immediately billing: base + prepaid (mid-cycle exact proration)")}`, async () => {
	const customerId = "cancel-imm-billing-prepaid-mid";

	const billingUnits = 100;
	const pricePerPack = 10;
	const initialQuantity = 500;
	const basePrice = 20;

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
			s.advanceTestClock({ days: 15 }),
		],
	});

	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerMidCycle,
		productId: pro.id,
	});

	const subscription = customerMidCycle.products?.[0];
	if (
		!subscription?.current_period_start ||
		!subscription?.current_period_end
	) {
		throw new Error("Missing billing period on subscription");
	}

	const billingPeriod = {
		start: subscription.current_period_start,
		end: subscription.current_period_end,
	};

	const frozenTimeMs = Math.floor(advancedTo! / 1000) * 1000;

	const prepaidAmount = (initialQuantity / billingUnits) * pricePerPack;
	const proratedBaseRefund = applyProration({
		now: frozenTimeMs,
		billingPeriod,
		amount: basePrice,
	});

	const proratedPrepaidRefund = applyProration({
		now: frozenTimeMs,
		billingPeriod,
		amount: prepaidAmount,
	});

	const expectedRefund = new Decimal(-proratedBaseRefund)
		.minus(proratedPrepaidRefund)
		.toNumber();

	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	expect(preview.total).toBeCloseTo(expectedRefund, 0);

	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("cancel immediately billing: base + allocated (mid-cycle exact proration)")}`, async () => {
	const customerId = "cancel-imm-billing-allocated-mid";

	const allocatedSeats = 8;
	const pricePerSeat = 10;
	const basePrice = 20;

	const allocatedItem = constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: pricePerSeat,
		includedUsage: 0,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	}) as LimitedItem;

	const pro = products.pro({
		id: "pro",
		items: [allocatedItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 15 }),
		],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: allocatedSeats,
	});

	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const subscription = customerMidCycle.products?.[0];
	if (
		!subscription?.current_period_start ||
		!subscription?.current_period_end
	) {
		throw new Error("Missing billing period on subscription");
	}

	const billingPeriod = {
		start: subscription.current_period_start,
		end: subscription.current_period_end,
	};

	const frozenTimeMs = Math.floor(advancedTo! / 1000) * 1000;

	const allocatedAmount = allocatedSeats * pricePerSeat;
	const proratedBaseRefund = applyProration({
		now: frozenTimeMs,
		billingPeriod,
		amount: basePrice,
	});

	const proratedAllocatedRefund = applyProration({
		now: frozenTimeMs,
		billingPeriod,
		amount: allocatedAmount,
	});

	const expectedRefund = new Decimal(-proratedBaseRefund)
		.minus(proratedAllocatedRefund)
		.toNumber();

	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	expect(preview.total).toBeCloseTo(expectedRefund, 0);

	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 3,
		latestTotal: preview.total,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Cancel Immediately Refund Tests
 *
 * Tests for the `refund_last_payment` parameter when canceling subscriptions immediately.
 * Unlike the default cancel-immediately flow (which creates credit invoice line items),
 * `refund_last_payment` issues a direct Stripe refund and skips credit invoice creation.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	applyProration,
	type BillingPreviewResponse,
	ErrCode,
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
import type Stripe from "stripe";
import AutumnError from "@/external/autumn/autumnCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceService } from "@/internal/invoices/InvoiceService";

const getLatestInvoice = ({ customer }: { customer: ApiCustomerV3 }) => {
	const invoice = customer.invoices?.[0];
	if (!invoice) {
		throw new Error("Expected customer to have an invoice");
	}

	return invoice;
};

const getRefundPreview = ({ preview }: { preview: BillingPreviewResponse }) => {
	if (!preview.refund) {
		throw new Error("Expected preview.refund to be defined");
	}

	return preview.refund;
};

const getBillingPeriod = ({
	customer,
	productId,
}: {
	customer: ApiCustomerV3;
	productId: string;
}) => {
	const product = customer.products?.find((entry) => entry.id === productId);
	if (!product?.current_period_start || !product.current_period_end) {
		throw new Error("Missing billing period on subscription");
	}

	return {
		start: product.current_period_start,
		end: product.current_period_end,
	};
};

const getAutumnInvoiceByStripeId = async ({
	ctx,
	stripeInvoiceId,
}: {
	ctx: AutumnContext;
	stripeInvoiceId: string;
}) => {
	const invoice = await InvoiceService.getByStripeId({
		db: ctx.db,
		stripeId: stripeInvoiceId,
	});

	if (!invoice) {
		throw new Error(`Expected Autumn invoice for ${stripeInvoiceId}`);
	}

	return invoice;
};

const expectWithinOneDollar = ({
	actual,
	expected,
}: {
	actual: number;
	expected: number;
}) => {
	expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
};

const createDirectStripeRefund = async ({
	stripeCli,
	stripeInvoiceId,
	amountInCents,
}: {
	stripeCli: Stripe;
	stripeInvoiceId: string;
	amountInCents: number;
}) => {
	const stripeInvoice = await stripeCli.invoices.retrieve(stripeInvoiceId, {
		expand: ["payments.data.payment.payment_intent"],
	});

	const payment = stripeInvoice.payments?.data?.[0]?.payment;
	if (!payment) {
		throw new Error("Expected Stripe invoice payment for direct refund test");
	}

	let chargeId: string | null = null;

	if (payment.type === "charge") {
		chargeId =
			typeof payment.charge === "string"
				? payment.charge
				: (payment.charge?.id ?? null);
	} else if (payment.type === "payment_intent") {
		const paymentIntentId =
			typeof payment.payment_intent === "string"
				? payment.payment_intent
				: payment.payment_intent?.id;

		if (!paymentIntentId) {
			throw new Error("Expected payment_intent on Stripe invoice payment");
		}

		const paymentIntent = await stripeCli.paymentIntents.retrieve(
			paymentIntentId,
			{ expand: ["latest_charge"] },
		);

		chargeId =
			typeof paymentIntent.latest_charge === "string"
				? paymentIntent.latest_charge
				: (paymentIntent.latest_charge?.id ?? null);
	}

	if (!chargeId) {
		throw new Error("Expected Stripe charge for direct refund test");
	}

	return stripeCli.refunds.create({
		charge: chargeId,
		amount: amountInCents,
	});
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel with refund_last_payment: "full" (start of cycle)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cancel immediately refund: full refund (start of cycle)")}`, async () => {
	const customerId = "cancel-imm-refund-full-start";

	const pro = products.pro({
		id: "pro",
		items: [],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	const initialInvoice = getLatestInvoice({ customer: customerAfterAttach });
	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
		refund_last_payment: "full" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);
	const refundPreview = getRefundPreview({ preview });

	expect(preview.total).toBe(0);
	expect(refundPreview).toEqual({
		amount: 20,
		invoice: {
			stripe_id: initialInvoice.stripe_id,
			total: 20,
			current_refunded_amount: 0,
			currency: initialInvoice.currency,
		},
	});

	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
	});

	const autumnInvoiceAfterCancel = await getAutumnInvoiceByStripeId({
		ctx,
		stripeInvoiceId: initialInvoice.stripe_id,
	});
	expect(autumnInvoiceAfterCancel.refunded_amount).toBe(20);

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel with refund_last_payment: "prorated" (mid-cycle)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cancel immediately refund: prorated refund (mid-cycle)")}`, async () => {
	const customerId = "cancel-imm-refund-prorated-mid";

	const pro = products.pro({
		id: "pro",
		items: [],
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

	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerMidCycle,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerMidCycle,
		count: 1,
		latestTotal: 20,
	});

	const billingPeriod = getBillingPeriod({
		customer: customerMidCycle,
		productId: pro.id,
	});
	const expectedRefund = applyProration({
		now: Math.floor(advancedTo! / 1000) * 1000,
		billingPeriod,
		amount: 20,
	});

	const initialInvoice = getLatestInvoice({ customer: customerMidCycle });
	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
		refund_last_payment: "prorated" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);
	const refundPreview = getRefundPreview({ preview });

	expect(preview.total).toBe(0);
	expectWithinOneDollar({
		actual: refundPreview.amount,
		expected: expectedRefund,
	});
	expect(refundPreview).toEqual({
		amount: preview.refund?.amount ?? 0,
		invoice: {
			stripe_id: initialInvoice.stripe_id,
			total: 20,
			current_refunded_amount: 0,
			currency: initialInvoice.currency,
		},
	});

	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
	});

	const autumnInvoiceAfterCancel = await getAutumnInvoiceByStripeId({
		ctx,
		stripeInvoiceId: initialInvoice.stripe_id,
	});

	expectWithinOneDollar({
		actual: autumnInvoiceAfterCancel.refunded_amount,
		expected: refundPreview.amount,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Mutual exclusivity validation (proration_behavior + refund_last_payment)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cancel immediately refund: mutual exclusivity (proration_behavior + refund_last_payment)")}`, async () => {
	const customerId = "cancel-imm-refund-mutual-excl";

	const pro = products.pro({
		id: "pro",
		items: [],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	try {
		await autumnV2_2.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately" as const,
			proration_behavior: "prorate_immediately" as const,
			refund_last_payment: "full" as const,
		});
		expect(true).toBe(false);
	} catch (error: unknown) {
		expect(error).toBeInstanceOf(AutumnError);
		expect((error as AutumnError).code).toBe(ErrCode.InvalidInputs);
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Full refund with base + prepaid messages
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cancel immediately refund: full refund with base + prepaid")}`, async () => {
	const customerId = "cancel-imm-refund-full-prepaid";
	const billingUnits = 100;
	const pricePerPack = 10;
	const initialQuantity = 300;
	const expectedInitialInvoice = 50;

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

	await expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: expectedInitialInvoice,
	});

	const initialInvoice = getLatestInvoice({ customer: customerAfterAttach });
	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
		refund_last_payment: "full" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);
	const refundPreview = getRefundPreview({ preview });

	expect(preview.total).toBe(0);
	expect(refundPreview).toEqual({
		amount: expectedInitialInvoice,
		invoice: {
			stripe_id: initialInvoice.stripe_id,
			total: expectedInitialInvoice,
			current_refunded_amount: 0,
			currency: initialInvoice.currency,
		},
	});

	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
	});

	const autumnInvoiceAfterCancel = await getAutumnInvoiceByStripeId({
		ctx,
		stripeInvoiceId: initialInvoice.stripe_id,
	});
	expect(autumnInvoiceAfterCancel.refunded_amount).toBe(expectedInitialInvoice);

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Prorated refund with base + prepaid messages (mid-cycle)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cancel immediately refund: prorated refund with base + prepaid (mid-cycle)")}`, async () => {
	const customerId = "cancel-imm-refund-prorated-prepaid-mid";
	const billingUnits = 100;
	const pricePerPack = 10;
	const initialQuantity = 500;
	const basePrice = 20;
	const prepaidAmount = 50;

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

	await expectCustomerInvoiceCorrect({
		customer: customerMidCycle,
		count: 1,
		latestTotal: basePrice + prepaidAmount,
	});

	const billingPeriod = getBillingPeriod({
		customer: customerMidCycle,
		productId: pro.id,
	});
	const now = Math.floor(advancedTo! / 1000) * 1000;
	const expectedRefund = new Decimal(
		applyProration({
			now,
			billingPeriod,
			amount: basePrice,
		}),
	)
		.plus(
			applyProration({
				now,
				billingPeriod,
				amount: prepaidAmount,
			}),
		)
		.toNumber();

	const initialInvoice = getLatestInvoice({ customer: customerMidCycle });
	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
		refund_last_payment: "prorated" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);
	const refundPreview = getRefundPreview({ preview });

	expect(preview.total).toBe(0);
	expectWithinOneDollar({
		actual: refundPreview.amount,
		expected: expectedRefund,
	});
	expect(refundPreview).toEqual({
		amount: preview.refund?.amount ?? 0,
		invoice: {
			stripe_id: initialInvoice.stripe_id,
			total: basePrice + prepaidAmount,
			current_refunded_amount: 0,
			currency: initialInvoice.currency,
		},
	});

	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
	});

	const autumnInvoiceAfterCancel = await getAutumnInvoiceByStripeId({
		ctx,
		stripeInvoiceId: initialInvoice.stripe_id,
	});

	expectWithinOneDollar({
		actual: autumnInvoiceAfterCancel.refunded_amount,
		expected: refundPreview.amount,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Preview and execution match exactly
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cancel immediately refund: preview and execution match exactly")}`, async () => {
	const customerId = "cancel-imm-refund-preview-execution-match";

	const pro = products.pro({
		id: "pro",
		items: [],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerBeforeCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceBeforeCancel = getLatestInvoice({
		customer: customerBeforeCancel,
	});

	// Read DB invoice BEFORE cancel to capture pre-cancel refunded_amount
	const autumnInvoiceBeforeCancel = await getAutumnInvoiceByStripeId({
		ctx,
		stripeInvoiceId: invoiceBeforeCancel.stripe_id,
	});

	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
		refund_last_payment: "full" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);
	const refundPreview = getRefundPreview({ preview });

	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
	});

	const autumnInvoiceAfterCancel = await getAutumnInvoiceByStripeId({
		ctx,
		stripeInvoiceId: invoiceBeforeCancel.stripe_id,
	});

	expect(refundPreview.invoice.stripe_id).toBe(invoiceBeforeCancel.stripe_id);
	expect(refundPreview.invoice.current_refunded_amount).toBe(
		autumnInvoiceBeforeCancel.refunded_amount,
	);
	expect(autumnInvoiceAfterCancel.refunded_amount).toBe(
		refundPreview.invoice.current_refunded_amount + refundPreview.amount,
	);
	expect(
		autumnInvoiceAfterCancel.refunded_amount -
			autumnInvoiceBeforeCancel.refunded_amount,
	).toBe(refundPreview.amount);

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Prior partial refund caps refund amount
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cancel immediately refund: prior partial refund cap")}`, async () => {
	const customerId = "cancel-imm-refund-prior-partial-cap";
	const priorPartialRefund = 5;

	const pro = products.pro({
		id: "pro",
		items: [],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	const initialInvoice = getLatestInvoice({ customer: customerAfterAttach });
	await createDirectStripeRefund({
		stripeCli: ctx.stripeCli,
		stripeInvoiceId: initialInvoice.stripe_id,
		amountInCents: priorPartialRefund * 100,
	});

	// Manually sync the refunded_amount in our DB (no webhook to do this)
	await InvoiceService.update({
		db: ctx.db,
		query: { stripeId: initialInvoice.stripe_id },
		updates: { refunded_amount: priorPartialRefund },
	});

	const invoiceAfterPartialRefund = await getAutumnInvoiceByStripeId({
		ctx,
		stripeInvoiceId: initialInvoice.stripe_id,
	});

	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
		refund_last_payment: "full" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);
	const refundPreview = getRefundPreview({ preview });

	expect(preview.total).toBe(0);
	expect(refundPreview).toEqual({
		amount: 15,
		invoice: {
			stripe_id: invoiceAfterPartialRefund.stripe_id,
			total: 20,
			current_refunded_amount: priorPartialRefund,
			currency: invoiceAfterPartialRefund.currency,
		},
	});

	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
	});

	const autumnInvoiceAfterCancel = await getAutumnInvoiceByStripeId({
		ctx,
		stripeInvoiceId: initialInvoice.stripe_id,
	});
	expect(autumnInvoiceAfterCancel.refunded_amount).toBe(20);

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

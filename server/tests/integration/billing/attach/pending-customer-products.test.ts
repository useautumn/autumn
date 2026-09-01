import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type ApiCustomerV5,
	type AttachParamsV1Input,
	CusProductStatus,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { handleVoidInvoiceCron } from "@/cron/invoiceCron/runInvoiceCron";
import { discardPendingCustomerProduct } from "@/internal/billing/v2/execute/discardPendingCustomerProduct";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

const listCustomerProducts = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	internalCustomerId: string;
}) =>
	await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: ALL_STATUSES,
	});

test.concurrent(
	`${chalk.yellowBright("invoice-mode pending: deferred attach inserts a pending plan that grants nothing")}`,
	async () => {
		const customerId = `invoice-mode-pending-inserted-${Date.now()}`;
		const pro = products.pro({
			id: "pro-invoice-pending",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, autumnV2_2, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: true,
				}),
			],
		});

		const customerProducts = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const pendingCustomerProduct = customerProducts.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		expect(pendingCustomerProduct).toBeDefined();
		expect(pendingCustomerProduct?.status).toBe(CusProductStatus.Pending);
		expect(pendingCustomerProduct?.metadata_id).toBeTruthy();

		const check = await autumnV2_2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(check.allowed).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice-mode pending: paying the invoice promotes the pending plan to active")}`,
	async () => {
		const customerId = `invoice-mode-pending-promoted-${Date.now()}`;
		const pro = products.pro({
			id: "pro-invoice-promoted",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, autumnV2_1, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: true,
				}),
			],
		});

		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer?.processor?.id ?? "",
			limit: 1,
		});

		await ctx.stripeCli.invoices.pay(stripeInvoices.data[0].id);
		await new Promise((resolve) => setTimeout(resolve, 12_000));

		const customerProducts = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const promotedCustomerProducts = customerProducts.filter(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		expect(promotedCustomerProducts).toHaveLength(1);
		expect(promotedCustomerProducts[0].status).toBe(CusProductStatus.Active);
		expect(promotedCustomerProducts[0].metadata_id).toBeNull();

		const apiCustomer =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

		await expectBalanceCorrect({
			customer: apiCustomer,
			featureId: TestFeature.Messages,
			remaining: 100,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("stripe-checkout pending: deferred checkout inserts a pending plan that grants nothing")}`,
	async () => {
		const customerId = `stripe-checkout-pending-inserted-${Date.now()}`;
		const pro = products.pro({
			id: "pro-checkout-pending",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, autumnV1, autumnV2_2, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
			actions: [],
		});

		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(result.payment_url).toContain("checkout.stripe.com");

		const customerProducts = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const pendingCustomerProduct = customerProducts.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		expect(pendingCustomerProduct?.status).toBe(CusProductStatus.Pending);
		expect(pendingCustomerProduct?.metadata_id).toBeTruthy();

		const check = await autumnV2_2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(check.allowed).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("stripe-checkout pending: completing checkout promotes the pending plan to active")}`,
	async () => {
		const customerId = `stripe-checkout-pending-promoted-${Date.now()}`;
		const pro = products.pro({
			id: "pro-checkout-promoted",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, autumnV2_2, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
		});

		await completeStripeCheckoutForm({ url: result.payment_url });
		await timeout(12000);

		const customerProducts = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const promotedCustomerProducts = customerProducts.filter(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		expect(promotedCustomerProducts).toHaveLength(1);
		expect(promotedCustomerProducts[0].status).toBe(CusProductStatus.Active);
		expect(promotedCustomerProducts[0].metadata_id).toBeNull();

		const check = await autumnV2_2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(check.allowed).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending custom plan: deferred attach with custom prices inserts a pending plan")}`,
	async () => {
		const customerId = `pending-custom-plan-prices-${Date.now()}`;
		const pro = products.pro({
			id: "pro-pending-custom",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, autumnV2_2, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 42 }) },
			invoice_mode: {
				enabled: true,
				enable_plan_immediately: false,
				finalize: true,
			},
		});

		const customerProducts = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const pendingCustomerProduct = customerProducts.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		expect(pendingCustomerProduct?.status).toBe(CusProductStatus.Pending);
		expect(pendingCustomerProduct?.customer_prices.length).toBeGreaterThan(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice-mode pending: voiding the invoice expires the pending plan")}`,
	async () => {
		const customerId = `invoice-mode-pending-expired-${Date.now()}`;
		const pro = products.pro({
			id: "pro-invoice-expired",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: true,
				}),
			],
		});

		const pendingCustomerProducts = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const pendingCustomerProduct = pendingCustomerProducts.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		expect(pendingCustomerProduct?.status).toBe(CusProductStatus.Pending);

		const deferredMetadata = await MetadataService.get({
			db: ctx.db,
			id: pendingCustomerProduct?.metadata_id ?? "",
		});

		await handleVoidInvoiceCron({ ctx, metadata: deferredMetadata! });

		const expiredCustomerProducts = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const expiredCustomerProduct = expiredCustomerProducts.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		expect(expiredCustomerProduct?.status).toBe(CusProductStatus.Expired);
		expect(expiredCustomerProduct?.metadata_id).toBeNull();
		expect(expiredCustomerProduct?.ended_at).toBeGreaterThan(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending cancel: cancelling a pending plan discards it and voids the invoice")}`,
	async () => {
		const customerId = `pending-cancel-discards-${Date.now()}`;
		const pro = products.pro({
			id: "pro-pending-cancel",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, autumnV1, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: true,
				}),
			],
		});

		const pendingCustomerProducts = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const pendingCustomerProduct = pendingCustomerProducts.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		expect(pendingCustomerProduct?.status).toBe(CusProductStatus.Pending);

		const metadataId = pendingCustomerProduct?.metadata_id ?? "";
		const deferredMetadata = await MetadataService.get({
			db: ctx.db,
			id: metadataId,
		});
		const stripeInvoiceId = deferredMetadata?.stripe_invoice_id ?? "";

		await autumnV1.cancel({
			customer_id: customerId,
			product_id: pro.id,
		});

		const cancelledCustomerProducts = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const cancelledCustomerProduct = cancelledCustomerProducts.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		expect(cancelledCustomerProduct?.status).toBe(CusProductStatus.Expired);
		expect(cancelledCustomerProduct?.metadata_id).toBeNull();

		const stripeInvoice =
			await ctx.stripeCli.invoices.retrieve(stripeInvoiceId);
		expect(stripeInvoice.status).toBe("void");

		const remainingMetadata = await MetadataService.get({
			db: ctx.db,
			id: metadataId,
		});
		expect(remainingMetadata).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("pending custom plan: paying a deferred custom plan promotes it to active")}`,
	async () => {
		const customerId = `pending-custom-promote-${Date.now()}`;
		const pro = products.pro({
			id: "pro-pending-custom-promote",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, autumnV2_2, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 42 }) },
			invoice_mode: {
				enabled: true,
				enable_plan_immediately: false,
				finalize: true,
			},
		});

		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer?.processor?.id ?? "",
			limit: 1,
		});

		await ctx.stripeCli.invoices.pay(stripeInvoices.data[0].id);
		await timeout(12000);

		const customerProducts = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const promoted = customerProducts.filter(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		expect(promoted).toHaveLength(1);
		expect(promoted[0].status).toBe(CusProductStatus.Active);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending expiry: a promoted plan is never expired by a late discard")}`,
	async () => {
		const customerId = `pending-expiry-guard-${Date.now()}`;
		const pro = products.pro({
			id: "pro-pending-expiry-guard",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: true,
				}),
			],
		});

		const pending = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const pendingCustomerProduct = pending.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer?.processor?.id ?? "",
			limit: 1,
		});
		await ctx.stripeCli.invoices.pay(stripeInvoices.data[0].id);
		await timeout(12000);

		// The row is Active now; a discard racing in afterwards must not undo it.
		await discardPendingCustomerProduct({
			ctx,
			customerProduct: pendingCustomerProduct!,
		});

		const afterDiscard = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const promoted = afterDiscard.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		expect(promoted?.status).toBe(CusProductStatus.Active);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending cancel: billing.update cancel_action discards a pending plan")}`,
	async () => {
		const customerId = `pending-cancel-update-${Date.now()}`;
		const pro = products.pro({
			id: "pro-pending-cancel-update",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, autumnV2_2, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: true,
				}),
			],
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			cancel_action: "cancel_immediately",
		});

		const customerProducts = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const cancelled = customerProducts.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		expect(cancelled?.status).toBe(CusProductStatus.Expired);
		expect(cancelled?.metadata_id).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("pending update: editing quantities re-attaches and replaces the invoice")}`,
	async () => {
		const customerId = `pending-update-quantity-${Date.now()}`;
		const pro = products.pro({
			id: "pro-pending-update-qty",
			items: [items.prepaidMessages({ billingUnits: 1, price: 0.34 })],
		});

		const { ctx, autumnV2_2, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 1000 }],
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: true,
				}),
			],
		});

		const beforeUpdate = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const originalPending = beforeUpdate.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);
		const originalMetadataId = originalPending?.metadata_id ?? "";

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 2000 },
			],
		});

		const afterUpdate = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const pendingRows = afterUpdate.filter(
			(customerProduct) =>
				customerProduct.product.id === pro.id &&
				customerProduct.status === CusProductStatus.Pending,
		);

		expect(pendingRows).toHaveLength(1);
		expect(pendingRows[0].metadata_id).not.toBe(originalMetadataId);
		expect(pendingRows[0].created_at).toBe(originalPending?.created_at ?? 0);

		const originalMetadata = await MetadataService.get({
			db: ctx.db,
			id: originalMetadataId,
		});
		expect(originalMetadata).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("pending update: an active plan still takes the normal update path")}`,
	async () => {
		const customerId = `pending-update-active-guard-${Date.now()}`;
		const pro = products.pro({
			id: "pro-pending-update-guard",
			items: [items.prepaidMessages({ billingUnits: 1, price: 0.1 })],
		});

		const { ctx, autumnV2_2, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});

		const customerProducts = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const rows = customerProducts.filter(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe(CusProductStatus.Active);
		expect(rows[0].metadata_id).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("pending update: a non-billing edit keeps the original payment")}`,
	async () => {
		const customerId = `pending-update-no-billing-${Date.now()}`;
		const pro = products.pro({
			id: "pro-pending-no-billing",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, autumnV2_2, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: true,
				}),
			],
		});

		const before = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const originalPending = before.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			no_billing_changes: true,
		});

		const after = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const stillPending = after.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		expect(stillPending?.status).toBe(CusProductStatus.Pending);
		expect(stillPending?.metadata_id).toBe(originalPending?.metadata_id);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending update: a billing edit leaves exactly one pending plan")}`,
	async () => {
		const customerId = `pending-update-survives-${Date.now()}`;
		const pro = products.pro({
			id: "pro-pending-survives",
			items: [items.prepaidMessages({ billingUnits: 1, price: 0.2 })],
		});

		// A default plan is what makes the gap dangerous: while the original is
		// discarded the customer has no plan, and the default machinery reacts.
		const { ctx, autumnV2_2, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, withDefault: true }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: true,
				}),
			],
		});

		const before = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const original = before.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 35 }) },
		});

		await timeout(6000);

		const after = await listCustomerProducts({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
		});
		const pendingRows = after.filter(
			(customerProduct) =>
				customerProduct.product.id === pro.id &&
				customerProduct.status === CusProductStatus.Pending,
		);

		expect(pendingRows).toHaveLength(1);
		expect(pendingRows[0].created_at).toBe(original?.created_at ?? 0);
	},
);

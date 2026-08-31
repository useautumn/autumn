import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type ApiCustomerV5,
	type AttachParamsV1Input,
	CusProductStatus,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

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
		const customerId = "invoice-mode-pending-inserted";
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
		const customerId = "invoice-mode-pending-promoted";
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
		const customerId = "stripe-checkout-pending-inserted";
		const pro = products.pro({
			id: "pro-checkout-pending",
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

		expect(result.payment_url).toBeDefined();

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
		const customerId = "stripe-checkout-pending-promoted";
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

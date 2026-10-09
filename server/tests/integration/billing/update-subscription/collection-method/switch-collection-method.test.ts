/**
 * billing.update with invoice_mode as the only change switches how an existing
 * subscription is collected, from the next renewal on.
 *
 * Contract:
 *   { invoice_mode: { enabled: true, net_terms_days, payment_method_types, apply_to_auto_topups } }
 *     → Stripe sub send_invoice with those terms + types, no invoice created,
 *       customer product collection_method send_invoice, auto top-ups invoiced
 *   { invoice_mode: { enabled: false, apply_to_auto_topups } }
 *     → Stripe sub charge_automatically, invoice-only types cleared, auto top-ups charged
 *   switch to charge automatically with no card on file → 400
 *   apply_to_auto_topups outside the pure switch (attach, or update with other changes) → 400
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type ApiCustomerV5,
	CollectionMethod,
	ErrCode,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

const loadCustomerProduct = async ({
	internalCustomerId,
	productId,
}: {
	internalCustomerId: string;
	productId: string;
}) => {
	const customerProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: ALL_STATUSES,
	});
	const customerProduct = customerProducts.find(
		(cp) => cp.product.id === productId,
	);
	if (!customerProduct) throw new Error(`No customer product for ${productId}`);
	return customerProduct;
};

const expectCollectionMethodCorrect = async ({
	internalCustomerId,
	productId,
	collectionMethod,
	daysUntilDue,
	paymentMethodTypes,
}: {
	internalCustomerId: string;
	productId: string;
	collectionMethod: CollectionMethod;
	daysUntilDue: number | null;
	paymentMethodTypes: string[] | null;
}) => {
	const customerProduct = await loadCustomerProduct({
		internalCustomerId,
		productId,
	});
	expect(customerProduct.collection_method).toBe(collectionMethod);

	const stripeSubscription = await ctx.stripeCli.subscriptions.retrieve(
		customerProduct.subscription_ids![0],
	);
	expect(stripeSubscription.collection_method).toBe(collectionMethod);
	expect(stripeSubscription.days_until_due).toBe(daysUntilDue);
	const actualTypes: string[] | null =
		stripeSubscription.payment_settings?.payment_method_types ?? null;
	expect(actualTypes).toEqual(paymentMethodTypes);
	return stripeSubscription;
};

test.concurrent(
	`${chalk.yellowBright("collection method switch: charge automatically ↔ invoicing, top-ups follow")}`,
	async () => {
		const customerId = "switch-collection-method";
		const pro = products.pro({
			id: "pro-switch",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});
		const internalCustomerId = customer?.internal_id ?? "";

		await autumnV2_3.customers.update(customerId, {
			billing_controls: {
				auto_topups: [
					{
						feature_id: TestFeature.Credits,
						enabled: true,
						threshold: 20,
						quantity: 100,
					},
				],
			},
		});

		const before = await loadCustomerProduct({
			internalCustomerId,
			productId: pro.id,
		});
		const stripeCustomerId = (
			await ctx.stripeCli.subscriptions.retrieve(before.subscription_ids![0])
		).customer as string;
		const invoiceCountBefore = (
			await ctx.stripeCli.invoices.list({ customer: stripeCustomerId })
		).data.length;

		// To invoicing
		await autumnV2_3.billing.update({
			customer_id: customerId,
			plan_id: pro.id,
			invoice_mode: {
				enabled: true,
				net_terms_days: 15,
				payment_method_types: ["card"],
				apply_to_auto_topups: true,
			},
		});

		await expectCollectionMethodCorrect({
			internalCustomerId,
			productId: pro.id,
			collectionMethod: CollectionMethod.SendInvoice,
			daysUntilDue: 15,
			paymentMethodTypes: ["card"],
		});
		const invoiceCountAfter = (
			await ctx.stripeCli.invoices.list({ customer: stripeCustomerId })
		).data.length;
		expect(invoiceCountAfter).toBe(invoiceCountBefore);

		const invoiced = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(invoiced.billing_controls?.auto_topups?.[0]?.invoice_mode).toBe(
			true,
		);

		// Back to charging automatically
		await autumnV2_3.billing.update({
			customer_id: customerId,
			plan_id: pro.id,
			invoice_mode: { enabled: false, apply_to_auto_topups: true },
		});

		await expectCollectionMethodCorrect({
			internalCustomerId,
			productId: pro.id,
			collectionMethod: CollectionMethod.ChargeAutomatically,
			daysUntilDue: null,
			paymentMethodTypes: null,
		});

		const charged = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(charged.billing_controls?.auto_topups?.[0]?.invoice_mode).toBe(
			false,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("collection method switch: charge automatically without a card → 400")}`,
	async () => {
		const customerId = "switch-collection-no-card";
		const pro = products.pro({
			id: "pro-switch-no-card",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, customer } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: true,
					finalizeInvoice: true,
				}),
			],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_3.billing.update({
					customer_id: customerId,
					plan_id: pro.id,
					invoice_mode: { enabled: false },
				}),
		});

		const customerProduct = await loadCustomerProduct({
			internalCustomerId: customer?.internal_id ?? "",
			productId: pro.id,
		});
		const stripeSubscription = await ctx.stripeCli.subscriptions.retrieve(
			customerProduct.subscription_ids![0],
		);
		expect(stripeSubscription.collection_method).toBe("send_invoice");
	},
);

test.concurrent(
	`${chalk.yellowBright("collection method switch: apply_to_auto_topups outside the pure switch → 400")}`,
	async () => {
		const customerId = "switch-collection-topups-scope";
		const pro = products.pro({
			id: "pro-switch-scope",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium-switch-scope",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_3.billing.attach({
					customer_id: customerId,
					plan_id: premium.id,
					invoice_mode: { enabled: true, apply_to_auto_topups: true },
				}),
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_3.billing.update({
					customer_id: customerId,
					plan_id: pro.id,
					feature_quantities: [],
					invoice_mode: { enabled: true, apply_to_auto_topups: true },
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("collection method switch: preview is $0, and terms without a Stripe subscription → 400")}`,
	async () => {
		const customerId = "switch-collection-preview";
		const pro = products.pro({
			id: "pro-switch-preview",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const free = products.base({
			id: "free-switch-preview",
			isAddOn: true,
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: free.id }),
			],
		});

		const preview = await autumnV2_3.billing.previewUpdate({
			customer_id: customerId,
			plan_id: pro.id,
			invoice_mode: { enabled: true, net_terms_days: 15 },
		});
		expect(preview.total).toBe(0);

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_3.billing.update({
					customer_id: customerId,
					plan_id: free.id,
					invoice_mode: { enabled: true, net_terms_days: 15 },
				}),
		});
	},
);

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	BillingContext,
	BillingPlan,
} from "@autumn/shared";
import { InvoiceStatus, stripeRefToId } from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan";
import { CusService } from "@/internal/customers/CusService";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { ProductService } from "@/internal/products/ProductService";

const getDefaultPaymentMethod = async ({
	stripeCli,
	stripeCustomer,
}: {
	stripeCli: Stripe;
	stripeCustomer: Stripe.Customer;
}): Promise<Stripe.PaymentMethod> => {
	const defaultPm = stripeCustomer.invoice_settings.default_payment_method;
	const defaultPmId = stripeRefToId(defaultPm);
	if (!defaultPmId) throw new Error("Missing default payment method");
	return stripeCli.paymentMethods.retrieve(defaultPmId);
};

const runFailingSubscriptionPlan = async ({
	customerId,
	invoiceLines,
	customerBalance,
}: {
	customerId: string;
	invoiceLines: Stripe.InvoiceAddLinesParams.Line[];
	customerBalance?: number;
}) => {
	const invoiceItemDescription = `Atomicity pending item ${customerId}`;

	const pro = products.pro({
		id: "min-promo-pro",
		items: [items.monthlyMessages({ includedUsage: 5_000 })],
	});

	const premium = products.premium({
		id: "min-promo-premium",
		items: [items.monthlyMessages({ includedUsage: 100_000 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) throw new Error("Missing Stripe customer");

	if (customerBalance !== undefined) {
		await ctx.stripeCli.customers.update(stripeCustomerId, {
			balance: customerBalance,
		});
	}

	const stripeCustomer = (await ctx.stripeCli.customers.retrieve(
		stripeCustomerId,
		{ expand: ["invoice_settings.default_payment_method"] },
	)) as Stripe.Customer;
	const paymentMethod = await getDefaultPaymentMethod({
		stripeCli: ctx.stripeCli,
		stripeCustomer,
	});
	const subscriptions = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "active",
		limit: 1,
	});
	const stripeSubscription = subscriptions.data[0];
	if (!stripeSubscription) throw new Error("Missing Stripe subscription");

	const coupon = await ctx.stripeCli.coupons.create({
		percent_off: 50,
		duration: "forever",
	});
	const promotionCode = await ctx.stripeCli.promotionCodes.create({
		promotion: { type: "coupon", coupon: coupon.id },
		code: `MINAMT${customerId.replaceAll("-", "")}`,
		restrictions: {
			minimum_amount: 100,
			minimum_amount_currency: "usd",
		},
	});

	const premiumFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: premium.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const billingContext = {
		fullCustomer,
		fullProducts: [premiumFull],
		featureQuantities: [],
		currentEpochMs: Date.now(),
		billingCycleAnchorMs: "now",
		resetCycleAnchorMs: "now",
		billingVersion: fullCustomer.customer_products[0].billing_version,
		stripeCustomer,
		stripeSubscription,
		paymentMethod,
		customPrices: [],
		customEnts: [],
		isCustom: false,
		requestedBillingCycleAnchor: "now",
	} satisfies BillingContext;
	const billingPlan = {
		autumn: {
			customerId,
			insertCustomerProducts: [],
			lineItems: [],
		},
		stripe: {
			invoiceAction: {
				addLineParams: { lines: invoiceLines },
			},
			invoiceItemsAction: {
				createInvoiceItems: [
					{
						customer: stripeCustomerId,
						subscription: stripeSubscription.id,
						amount: 456,
						currency: "usd",
						description: invoiceItemDescription,
					},
				],
			},
			subscriptionAction: {
				type: "update",
				stripeSubscriptionId: stripeSubscription.id,
				params: {
					discounts: [{ promotion_code: promotionCode.id }],
					proration_behavior: "none",
					payment_behavior: "error_if_incomplete",
				},
			},
		},
	} satisfies BillingPlan;

	const invoicesBefore = await InvoiceService.list({
		db: ctx.db,
		internalCustomerId: fullCustomer.internal_id,
	});
	const invoiceIdsBefore = new Set(
		invoicesBefore.map((invoice) => invoice.stripe_id),
	);

	let executeError: unknown;
	try {
		await executeStripeBillingPlan({
			ctx,
			billingContext,
			billingPlan,
		});
	} catch (error) {
		executeError = error;
	}

	await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await autumnV2_2.customers.get(customerId);

	const invoices = await InvoiceService.list({
		db: ctx.db,
		internalCustomerId: fullCustomer.internal_id,
	});
	const rollbackInvoices = invoices.filter(
		(invoice) => !invoiceIdsBefore.has(invoice.stripe_id),
	);
	const pendingInvoiceItems = await ctx.stripeCli.invoiceItems.list({
		customer: stripeCustomerId,
		pending: true,
	});
	const hasPendingInvoiceItem = pendingInvoiceItems.data.some(
		(item) => item.description === invoiceItemDescription,
	);

	return {
		ctx,
		executeError,
		rollbackInvoices,
		hasPendingInvoiceItem,
		stripeCustomerId,
	};
};

test.concurrent(
	chalk.yellowBright(
		"stripe billing plan atomicity: failed subscription action refunds prior invoice action",
	),
	async () => {
		const customerId = `min-promo-atomic-${Date.now()}`;
		const { ctx, executeError, rollbackInvoices, hasPendingInvoiceItem } =
			await runFailingSubscriptionPlan({
				customerId,
				invoiceLines: [
					{
						amount: 123,
						description: "Atomicity repro invoice line",
						discountable: false,
					},
				],
			});

		expect((executeError as Error).message).toInclude("minimum_amount");
		expect(rollbackInvoices).toHaveLength(1);
		expect(rollbackInvoices[0].status).toBe(InvoiceStatus.Paid);
		expect(rollbackInvoices[0].refunded_amount ?? 0).toBeGreaterThanOrEqual(
			rollbackInvoices[0].total,
		);
		expect(hasPendingInvoiceItem).toBe(false);
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	chalk.yellowBright(
		"stripe billing plan atomicity: failed subscription action after a $0 invoice surfaces the subscription error",
	),
	async () => {
		const customerId = `min-promo-atomic-zero-${Date.now()}`;
		const { ctx, executeError, rollbackInvoices, hasPendingInvoiceItem } =
			await runFailingSubscriptionPlan({
				customerId,
				invoiceLines: [
					{ amount: -123, description: "Unused plan", discountable: false },
					{ amount: 123, description: "New plan", discountable: false },
				],
			});

		expect((executeError as Error).message).toInclude("minimum_amount");
		expect(rollbackInvoices).toHaveLength(1);
		expect(rollbackInvoices[0].total).toBe(0);
		expect(hasPendingInvoiceItem).toBe(false);
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	chalk.yellowBright(
		"stripe billing plan atomicity: failed subscription action restores credit balance spent on the invoice",
	),
	async () => {
		const customerId = `min-promo-atomic-balance-${Date.now()}`;
		const { ctx, executeError, hasPendingInvoiceItem, stripeCustomerId } =
			await runFailingSubscriptionPlan({
				customerId,
				customerBalance: -500,
				invoiceLines: [
					{
						amount: 123,
						description: "Atomicity repro invoice line",
						discountable: false,
					},
				],
			});

		expect((executeError as Error).message).toInclude("minimum_amount");
		const stripeCustomer = (await ctx.stripeCli.customers.retrieve(
			stripeCustomerId,
		)) as Stripe.Customer;
		expect(stripeCustomer.balance).toBe(-500);
		expect(hasPendingInvoiceItem).toBe(false);
	},
);

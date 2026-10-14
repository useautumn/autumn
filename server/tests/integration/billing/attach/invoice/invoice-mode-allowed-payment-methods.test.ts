import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	type InvoicePaymentMethod,
	InvoicePaymentMethodSchema,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";

const CANDIDATE_PAYMENT_METHODS: InvoicePaymentMethod[] = [
	"card",
	"customer_balance",
	"us_bank_account",
	"link",
];

const sorted = (values: string[] | null | undefined) =>
	[...(values ?? [])].sort();

const paymentMethodsOverride = () => {
	const raw = process.env.TEST_INVOICE_PAYMENT_METHODS;
	if (!raw) return undefined;
	const parsed = InvoicePaymentMethodSchema.array()
		.min(1)
		.safeParse(raw.split(",").map((method) => method.trim()));
	if (!parsed.success) {
		throw new Error(
			`TEST_INVOICE_PAYMENT_METHODS is not a valid payment method list: "${raw}"`,
		);
	}
	return parsed.data;
};

const resolveActivatedPaymentMethods = async ({
	stripeCli,
}: {
	stripeCli: Stripe;
}): Promise<InvoicePaymentMethod[]> => {
	const override = paymentMethodsOverride();
	if (override) return override;

	try {
		const configurations = await stripeCli.paymentMethodConfigurations.list({
			limit: 10,
		});
		const defaultConfiguration =
			configurations.data.find((configuration) => configuration.is_default) ??
			configurations.data[0];
		const activated = CANDIDATE_PAYMENT_METHODS.filter(
			(method) => defaultConfiguration?.[method]?.available === true,
		);
		return activated.length > 0 ? activated : ["card"];
	} catch {
		return ["card"];
	}
};

const findCycleInvoice = async ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
}): Promise<Stripe.Invoice | undefined> => {
	for (let attempt = 0; attempt < 5; attempt++) {
		const invoices = await stripeCli.invoices.list({
			customer: stripeCustomerId,
			limit: 10,
		});
		const cycleInvoice = invoices.data.find(
			(invoice) => invoice.billing_reason === "subscription_cycle",
		);
		if (cycleInvoice) return cycleInvoice;
		await timeout(10000);
	}
	return undefined;
};

test.concurrent(
	`${chalk.yellowBright("invoice-mode payment methods: cycle invoice inherits the org's allowed list")}`,
	async () => {
		const customerId = "invoice-payment-methods-cycle";
		const usageItem = items.consumable({
			featureId: TestFeature.Messages,
			includedUsage: 0,
			price: 0.01,
			billingUnits: 1,
		});
		const usagePlan = products.base({
			id: "usage-plan",
			items: [usageItem],
		});

		const subOrgSlug = `invoice-pm-${Math.random().toString(36).slice(2, 8)}`;
		const { ctx: probeCtx } = await initScenario({
			setup: [s.platform.create({ slug: subOrgSlug })],
			actions: [],
		});

		const allowedPaymentMethods = await resolveActivatedPaymentMethods({
			stripeCli: probeCtx.stripeCli,
		});

		if (allowedPaymentMethods.length < 2) {
			console.warn(
				`[invoice-mode-allowed-payment-methods] only "${allowedPaymentMethods.join(", ")}" activated on Stripe account ${probeCtx.org.slug}; asserting on a reduced list`,
			);
		}

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					slug: subOrgSlug,
					configOverrides: { allowed_payment_methods: allowedPaymentMethods },
					setupDefaultFeatures: true,
				}),
				s.customer({ testClock: true }),
				s.products({ list: [usagePlan] }),
			],
			actions: [
				s.billing.attach({
					productId: usagePlan.id,
					invoice: true,
					enableProductImmediately: true,
					finalizeInvoice: true,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 1000,
					timeout: 3000,
				}),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const stripeCustomerId = customer!.processor!.id!;
		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId,
			limit: 1,
		});
		const subscription = subscriptions.data[0];

		expect(subscription).toBeDefined();
		expect(subscription.collection_method).toBe("send_invoice");
		expect(sorted(subscription.payment_settings?.payment_method_types)).toEqual(
			sorted(allowedPaymentMethods),
		);

		const cycleInvoice = await findCycleInvoice({
			stripeCli: ctx.stripeCli,
			stripeCustomerId,
		});

		expect(cycleInvoice).toBeDefined();
		expect(cycleInvoice!.total).toBe(1000);
		expect(
			sorted(cycleInvoice!.payment_settings?.payment_method_types),
		).toEqual(sorted(allowedPaymentMethods));
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice-mode payment methods: unset org config sends no payment_method_types")}`,
	async () => {
		const customerId = "invoice-payment-methods-unset";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					finalizeInvoice: true,
				}),
			],
		});

		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: customer!.processor!.id!,
			limit: 1,
		});
		const subscription = subscriptions.data[0];

		expect(subscription).toBeDefined();
		expect(subscription.collection_method).toBe("send_invoice");
		expect(subscription.payment_settings?.payment_method_types).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice-mode payment methods: request payment_method_types overrides the org list")}`,
	async () => {
		const customerId = "invoice-payment-methods-request";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, customer, autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					slug: `invoice-pm-req-${Math.random().toString(36).slice(2, 8)}`,
					configOverrides: {
						allowed_payment_methods: ["card", "customer_balance"],
					},
					setupDefaultFeatures: true,
				}),
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			invoice_mode: {
				enabled: true,
				finalize: true,
				enable_plan_immediately: true,
				payment_method_types: ["card"],
			},
		});

		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: customer!.processor!.id!,
			limit: 1,
		});
		const subscription = subscriptions.data[0];

		expect(subscription).toBeDefined();
		expect(subscription.collection_method).toBe("send_invoice");
		expect(subscription.payment_settings?.payment_method_types).toEqual([
			"card",
		]);

		const invoice = await ctx.stripeCli.invoices.retrieve(
			subscription.latest_invoice as string,
		);
		expect(invoice.payment_settings.payment_method_types).toEqual(["card"]);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice-mode payment methods: V0 payment_method_types overrides the org list")}`,
	async () => {
		const customerId = "invoice-payment-methods-request-v0";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, customer, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					slug: `invoice-pm-v0-${Math.random().toString(36).slice(2, 8)}`,
					configOverrides: {
						allowed_payment_methods: ["card", "customer_balance"],
					},
					setupDefaultFeatures: true,
				}),
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			invoice: true,
			finalize_invoice: true,
			enable_product_immediately: true,
			payment_method_types: ["card"],
		});

		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: customer!.processor!.id!,
			limit: 1,
		});
		expect(subscriptions.data[0]?.payment_settings?.payment_method_types).toEqual(
			["card"],
		);
	},
);

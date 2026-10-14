import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	PreviewUpdateSubscriptionResponse,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const auAddress = {
	country: "AU",
	line1: "1 Test St",
	city: "Sydney",
	postal_code: "2000",
	state: "NSW",
};

const billingUnits = 12;
const pricePerUnit = 8;
const baseUnits = 10;
const targetUnits = 20;
const expectedSubtotal = (targetUnits - baseUnits) * pricePerUnit;

const buildPrepaidProduct = () =>
	products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

test.concurrent(
	`${chalk.yellowBright("preview-update-subscription-credits (Stripe credit on file): credits present, sign-flipped, total subtracts capped credit")}`,
	async () => {
		const customerId = "us-credits-on";
		const product = buildPrepaidProduct();

		const { ctx, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: baseUnits * billingUnits,
						},
					],
				}),
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const stripeCustomerId = customer.stripe_id;
		expect(stripeCustomerId).toBeDefined();
		await ctx.stripeCli.customers.update(stripeCustomerId!, {
			balance: -2000,
		});

		const preview = (await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: targetUnits * billingUnits,
				},
			],
		})) as PreviewUpdateSubscriptionResponse;

		expect(preview.subtotal).toBe(expectedSubtotal);
		expect(preview.invoice_credits).toBeDefined();
		expect(preview.invoice_credits?.balance).toBe(20);
		expect(preview.invoice_credits?.currency).toBe(preview.currency);
		expect(preview.tax).toBeUndefined();
		const expectedCappedCredit = Math.min(20, expectedSubtotal);
		expect(preview.total).toBe(expectedSubtotal - expectedCappedCredit);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("preview-update-subscription-credits (zero balance): credits present with balance=0, total === subtotal")}`,
	async () => {
		const customerId = "us-credits-zero";
		const product = buildPrepaidProduct();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: baseUnits * billingUnits,
						},
					],
				}),
			],
		});

		const preview = (await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: targetUnits * billingUnits,
				},
			],
		})) as PreviewUpdateSubscriptionResponse;

		expect(preview.subtotal).toBe(expectedSubtotal);
		expect(preview.invoice_credits).toBeDefined();
		expect(preview.invoice_credits?.balance).toBe(0);
		expect(preview.invoice_credits?.currency).toBe(preview.currency);
		expect(preview.tax).toBeUndefined();
		expect(preview.total).toBe(expectedSubtotal);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("preview-update-subscription-tax (auto_tax on, AU customer): tax.status=complete, total = subtotal + tax")}`,
	async () => {
		const customerId = "us-tax-on";
		const proProd = products.pro({ id: "pro", items: [] });

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: { automatic_tax: true },
					taxRegistrations: ["AU"],
				}),
				s.customer({
					testClock: false,
					paymentMethod: "success",
					stripeCustomerOverrides: { address: auAddress },
				}),
				s.products({ list: [proProd] }),
			],
			actions: [s.billing.attach({ productId: "pro" })],
		});

		const preview = (await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			items: [items.monthlyPrice({ price: 50 })],
		})) as PreviewUpdateSubscriptionResponse;

		expect(preview.subtotal).toBeGreaterThan(0);
		expect(preview.tax).toBeDefined();
		expect(preview.tax?.status).toBe("complete");
		expect(preview.tax?.currency).toBe(preview.currency);
		expect(preview.tax?.total).toBeGreaterThan(0);
		expect(preview.tax?.amount_exclusive).toBeGreaterThan(0);

		expect(preview.invoice_credits?.balance ?? 0).toBe(0);
		expect(preview.total).toBeCloseTo(
			preview.subtotal + (preview.tax?.total ?? 0),
			2,
		);
		expect(preview.total).toBeGreaterThan(preview.subtotal);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("preview-update-subscription-tax (auto_tax off): tax field omitted, total === subtotal (no credit)")}`,
	async () => {
		const customerId = "us-tax-off";
		const proProd = products.pro({ id: "pro", items: [] });

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({ taxRegistrations: ["AU"] }),
				s.customer({
					testClock: false,
					paymentMethod: "success",
					stripeCustomerOverrides: { address: auAddress },
				}),
				s.products({ list: [proProd] }),
			],
			actions: [s.billing.attach({ productId: "pro" })],
		});

		const preview = (await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			items: [items.monthlyPrice({ price: 50 })],
		})) as PreviewUpdateSubscriptionResponse;

		expect(preview.subtotal).toBeGreaterThan(0);
		expect(preview.tax).toBeUndefined();
		expect(preview.invoice_credits?.balance ?? 0).toBe(0);
		expect(preview.total).toBe(preview.subtotal);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("preview-update-subscription-tax-rate-id (exclusive 10%): custom tax rate returns exact tax and total")}`,
	async () => {
		const customerId = "preview-update-tax-rate-id";
		const proProd = products.base({
			id: "pro",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 20 }),
			],
		});

		const { ctx, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proProd] }),
			],
			actions: [],
		});

		const taxRate = await ctx.stripeCli.taxRates.create({
			display_name: "Preview Update Tax Rate",
			percentage: 10,
			inclusive: false,
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: proProd.id,
			tax_rate_id: taxRate.id,
		});

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: proProd.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 40 }),
			},
		};

		const preview =
			(await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			)) as PreviewUpdateSubscriptionResponse;

		expect(preview.subtotal).toBe(20);
		expect(preview.tax).toBeDefined();
		expect(preview.tax?.status).toBe("complete");
		expect(preview.tax?.currency).toBe(preview.currency);
		expect(preview.tax?.amount_exclusive).toBe(2);
		expect(preview.tax?.amount_inclusive).toBe(0);
		expect(preview.tax?.total).toBe(2);
		expect(preview.total).toBe(22);
	},
	300_000,
);

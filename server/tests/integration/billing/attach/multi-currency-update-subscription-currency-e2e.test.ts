/**
 * TDD test: update subscription must recognize a currency-only price edit for a
 * customer locked to a non-default currency (dashboard "Update Subscription").
 *
 * Red-failure mode (current behavior):
 *  - The dashboard sends V0 params (top-level `items`) at x-api-version 1.2. The
 *    V0 -> V1 transform (productItemToBasePriceParams / productItemToPlanItemParamsV1)
 *    drops `additional_currencies`, so an inr-only edit (base usd untouched)
 *    reaches compute as "base amount unchanged" — preview reports no charge and
 *    the Stripe subscription keeps billing the old inr amount.
 *
 * Green-success criteria (after fix):
 *  - Currency-only edits survive the V0 -> V1 mapping: preview reports the
 *    prorated inr difference, a prorated inr invoice is produced, the Stripe
 *    subscription item moves to a price with the new inr unit_amount, and the
 *    stored customer price config carries the new inr amount.
 *  - An update with identical amounts stays a no-op (control).
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	type CreatePlanParamsV2Input,
	type FixedPriceConfig,
	type ProductItem,
	ProductItemInterval,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { CusService } from "@/internal/customers/CusService";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

const USD_BASE = 100;
const INR_BASE = 100;
const INR_UPDATED = 200;

const createInrPlan = async () => {
	const planId = `mc_upsub_ccy_${getSuffix()}`;
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "MC Update Subscription Currency Plan",
		auto_enable: false,
		price: {
			amount: USD_BASE,
			interval: BillingInterval.Month,
			additional_currencies: [{ currency: "inr", amount: INR_BASE }],
		},
	});
	return planId;
};

const getStoredBasePriceConfig = async ({
	ctx,
	customerId,
	planId,
}: {
	ctx: TestContext;
	customerId: string;
	planId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = fullCustomer.customer_products.find(
		(cusProduct) =>
			cusProduct.product.id === planId && cusProduct.status === "active",
	);
	expect(customerProduct).toBeDefined();
	const customerPrice = customerProduct?.customer_prices.find(
		(cusPrice) => cusPrice.price.config?.type === "fixed",
	);
	expect(customerPrice).toBeDefined();
	return customerPrice?.price.config as FixedPriceConfig;
};

const getActiveStripeSubscription = async ({
	ctx,
	stripeCustomerId,
}: {
	ctx: TestContext;
	stripeCustomerId: string;
}) => {
	const subs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
	});
	expect(subs.data).toHaveLength(1);
	return subs.data[0];
};

test.concurrent(
	`${chalk.yellowBright("mc update sub currency 1: V1 customize.price inr-only edit is recognized (preview + stripe + invoice + stored config)")}`,
	async () => {
		const planId = await createInrPlan();

		const { customerId, autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId: "mc-upsub-ccy-v1",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: planId,
			currency: "inr",
		});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: planId,
			customize: {
				price: {
					amount: USD_BASE,
					interval: BillingInterval.Month,
					additional_currencies: [{ currency: "inr", amount: INR_UPDATED }],
				},
			},
		};

		// The preview must recognize the currency-only edit (dashboard preview).
		const preview =
			await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		expect(preview.currency).toBe("inr");
		expect(preview.total).toBeGreaterThanOrEqual(INR_UPDATED - INR_BASE - 1);
		expect(preview.total).toBeLessThanOrEqual(INR_UPDATED - INR_BASE);

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.invoices).toHaveLength(2);

		// Prorated inr difference (~100, minus a few seconds of elapsed period).
		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer.stripe_id as string,
		});
		const latestInvoice = stripeInvoices.data[0];
		expect(latestInvoice.currency).toBe("inr");
		expect(latestInvoice.total).toBeGreaterThanOrEqual(
			(INR_UPDATED - INR_BASE) * 100 - 100,
		);
		expect(latestInvoice.total).toBeLessThanOrEqual(
			(INR_UPDATED - INR_BASE) * 100,
		);

		const subscription = await getActiveStripeSubscription({
			ctx,
			stripeCustomerId: customer.stripe_id as string,
		});
		expect(subscription.currency).toBe("inr");
		expect(subscription.items.data).toHaveLength(1);
		expect(subscription.items.data[0].price.currency).toBe("inr");
		expect(subscription.items.data[0].price.unit_amount).toBe(
			INR_UPDATED * 100,
		);

		const storedConfig = await getStoredBasePriceConfig({
			ctx,
			customerId,
			planId,
		});
		expect(storedConfig.amount).toBe(USD_BASE);
		expect(storedConfig.currencies?.inr?.amount).toBe(INR_UPDATED);
	},
);

test.concurrent(
	`${chalk.yellowBright("mc update sub currency 2: dashboard V0 items shape inr-only edit is recognized (x-api-version 1.2)")}`,
	async () => {
		const planId = await createInrPlan();

		const { customerId, autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId: "mc-upsub-ccy-v0",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: planId,
			currency: "inr",
		});

		// The dashboard sends the full item list with only the inr amount edited.
		const items: ProductItem[] = [
			{
				price: USD_BASE,
				interval: ProductItemInterval.Month,
				additional_currencies: [{ currency: "inr", amount: INR_UPDATED }],
			},
		];

		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: planId,
			items,
		});
		expect(preview.currency).toBe("inr");
		expect(preview.total).toBeGreaterThanOrEqual(INR_UPDATED - INR_BASE - 1);
		expect(preview.total).toBeLessThanOrEqual(INR_UPDATED - INR_BASE);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: planId,
			items,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.invoices).toHaveLength(2);

		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer.stripe_id as string,
		});
		const latestInvoice = stripeInvoices.data[0];
		expect(latestInvoice.currency).toBe("inr");
		expect(latestInvoice.total).toBeGreaterThanOrEqual(
			(INR_UPDATED - INR_BASE) * 100 - 100,
		);
		expect(latestInvoice.total).toBeLessThanOrEqual(
			(INR_UPDATED - INR_BASE) * 100,
		);

		const subscription = await getActiveStripeSubscription({
			ctx,
			stripeCustomerId: customer.stripe_id as string,
		});
		expect(subscription.currency).toBe("inr");
		expect(subscription.items.data).toHaveLength(1);
		expect(subscription.items.data[0].price.currency).toBe("inr");
		expect(subscription.items.data[0].price.unit_amount).toBe(
			INR_UPDATED * 100,
		);

		const storedConfig = await getStoredBasePriceConfig({
			ctx,
			customerId,
			planId,
		});
		expect(storedConfig.amount).toBe(USD_BASE);
		expect(storedConfig.currencies?.inr?.amount).toBe(INR_UPDATED);
	},
);

test.concurrent(
	`${chalk.yellowBright("mc update sub currency 3: unchanged currencies stay a no-op (control)")}`,
	async () => {
		const planId = await createInrPlan();

		const { customerId, autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId: "mc-upsub-ccy-noop",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: planId,
			currency: "inr",
		});

		const noopParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: planId,
			customize: {
				price: {
					amount: USD_BASE,
					interval: BillingInterval.Month,
					additional_currencies: [{ currency: "inr", amount: INR_BASE }],
				},
			},
		};

		// The identical-plan guard (which must treat identical currency maps as
		// unchanged) is the existing no-op semantic for both preview and update.
		await expect(
			autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				noopParams,
			),
		).rejects.toThrow(/identical to the current subscription/);
		await expect(
			autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
				noopParams,
			),
		).rejects.toThrow(/identical to the current subscription/);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.invoices).toHaveLength(1);

		const subscription = await getActiveStripeSubscription({
			ctx,
			stripeCustomerId: customer.stripe_id as string,
		});
		expect(subscription.items.data).toHaveLength(1);
		expect(subscription.items.data[0].price.currency).toBe("inr");
		expect(subscription.items.data[0].price.unit_amount).toBe(INR_BASE * 100);

		const storedConfig = await getStoredBasePriceConfig({
			ctx,
			customerId,
			planId,
		});
		expect(storedConfig.currencies?.inr?.amount).toBe(INR_BASE);
	},
);

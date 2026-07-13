import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
	ErrCode,
	filterCustomerProductsByActiveStatuses,
	filterCustomerProductsByStripeSubscriptionId,
	findActiveCustomerProductById,
	getPriceCurrencyStripeId,
	isFixedPrice,
	isPrepaidPrice,
} from "@autumn/shared";
import { customerProductToBasePrice } from "@shared/utils/cusProductUtils/convertCusProduct/customerProductToPrice";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";
import { initStripeResourcesForProducts } from "@/internal/billing/v2/providers/stripe/utils/common/initStripeResourcesForProducts";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import { invalidateProductsCache } from "@/internal/products/productCacheUtils";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const uniqueId = (prefix: string) =>
	`${prefix}_${Math.random().toString(36).slice(2, 9)}`;

const createPlan = async ({
	planId,
	withPrepaid = false,
	intervalCount = 1,
}: {
	planId: string;
	withPrepaid?: boolean;
	intervalCount?: number;
}) => {
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: planId,
		auto_enable: false,
		price: {
			amount: 20,
			interval: BillingInterval.Month,
			interval_count: intervalCount,
			additional_currencies: [{ currency: "eur", amount: 18 }],
		},
		items: withPrepaid
			? [
					{
						feature_id: TestFeature.Messages,
						included: 0,
						price: {
							amount: 10,
							interval: BillingInterval.Month,
							billing_method: BillingMethod.Prepaid,
							billing_units: 100,
							additional_currencies: [{ currency: "eur", amount: 9 }],
						},
					},
				]
			: undefined,
	});
};

const getProduct = async ({ planId }: { planId: string }) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

const initializeCurrency = async ({
	planId,
	currency,
}: {
	planId: string;
	currency: string;
}) => {
	let product = await getProduct({ planId });
	await initStripeResourcesForProducts({ ctx, products: [product] });
	product = await getProduct({ planId });

	for (const price of product.prices) {
		await createStripePriceIFNotExist({
			ctx,
			price,
			entitlements: product.entitlements,
			product,
			currency,
		});
	}

	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });
	return getProduct({ planId });
};

const priceIdForCurrency = ({
	product,
	currency,
	kind,
}: {
	product: Awaited<ReturnType<typeof getProduct>>;
	currency: string;
	kind: "fixed" | "prepaid";
}) => {
	const price = product.prices.find((candidate) =>
		kind === "fixed" ? isFixedPrice(candidate) : isPrepaidPrice(candidate),
	);
	if (!price) throw new Error(`${product.id} has no ${kind} price`);

	const id = getPriceCurrencyStripeId({
		config: price.config,
		currency,
		orgDefault: ctx.org.default_currency ?? "usd",
		slot: kind === "prepaid" ? "stripe_prepaid_price_v2_id" : "stripe_price_id",
	});
	if (!id) throw new Error(`${product.id} has no ${currency} ${kind} price`);
	return id;
};

const createExternalSubscription = async ({
	customerId,
	items,
	currency,
}: {
	customerId: string;
	items: Stripe.SubscriptionCreateParams.Item[];
	currency?: string;
}) => {
	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	if (!customer.processor?.id)
		throw new Error(`${customerId} has no Stripe ID`);

	return ctx.stripeCli.subscriptions.create({
		customer: customer.processor.id,
		items,
		currency,
		metadata: { autumn_managed_at: String(Date.now()) },
	});
};

const syncSubscription = async ({
	autumnV1,
	customerId,
	subscription,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	customerId: string;
	subscription: Stripe.Subscription;
}) => {
	const proposal = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
	});
	await autumnV1.post("/billing.sync_v2", proposal.params);
	return proposal;
};

test(`${chalk.yellowBright("sync multi-currency: exact EUR price locks an unset customer and verifies")}`, async () => {
	const planId = uniqueId("sync_mc_exact");
	await createPlan({ planId });
	const product = await initializeCurrency({ planId, currency: "eur" });
	const { customerId, autumnV1 } = await initScenario({
		customerId: uniqueId("sync-mc-exact-customer"),
		setup: [s.customer({ paymentMethod: "success" })],
		actions: [],
	});
	const subscription = await createExternalSubscription({
		customerId,
		items: [
			{
				price: priceIdForCurrency({ product, currency: "eur", kind: "fixed" }),
			},
		],
	});

	await syncSubscription({ autumnV1, customerId, subscription });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: planId });
	expect(
		(await CusService.getFull({ ctx, idOrInternalId: customerId })).currency,
	).toBe("eur");

	const verified = await autumnV1.post("/billing.verify", {
		customer_id: customerId,
	});
	expect(verified.subscriptions).toEqual([
		expect.objectContaining({
			stripe_subscription_id: subscription.id,
			status: "correct",
		}),
	]);
});

test(`${chalk.yellowBright("sync multi-currency: EUR base and prepaid prices import together")}`, async () => {
	const planId = uniqueId("sync_mc_prepaid");
	await createPlan({ planId, withPrepaid: true });
	const product = await initializeCurrency({ planId, currency: "eur" });
	const { customerId, autumnV1 } = await initScenario({
		customerId: uniqueId("sync-mc-prepaid-customer"),
		setup: [
			s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
		],
		actions: [],
	});
	const subscription = await createExternalSubscription({
		customerId,
		items: [
			{
				price: priceIdForCurrency({ product, currency: "eur", kind: "fixed" }),
			},
			{
				price: priceIdForCurrency({
					product,
					currency: "eur",
					kind: "prepaid",
				}),
				quantity: 2,
			},
		],
	});

	await syncSubscription({ autumnV1, customerId, subscription });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(
		(await CusService.getFull({ ctx, idOrInternalId: customerId })).currency,
	).toBe("eur");
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});
	expect(
		subscription.items.data.every((item) => item.price.currency === "eur"),
	).toBe(true);
});

test(`${chalk.yellowBright("sync multi-currency: shared USD Price imports its EUR option with provenance")}`, async () => {
	const planId = uniqueId("sync_mc_shape");
	await createPlan({ planId, intervalCount: 3 });
	await initializeCurrency({ planId, currency: "usd" });
	const product = await getProduct({ planId });
	if (!product.processor?.id)
		throw new Error(`${planId} has no Stripe product`);
	const sharedPrice = await ctx.stripeCli.prices.create({
		product: product.processor.id,
		currency: "usd",
		unit_amount: 2000,
		currency_options: {
			eur: { unit_amount: 1800 },
			gbp: { unit_amount: 1600 },
			jpy: { unit_amount: 3000 },
		},
		recurring: { interval: "month", interval_count: 3 },
	});
	const { customerId, autumnV1 } = await initScenario({
		customerId: uniqueId("sync-mc-shape-customer"),
		setup: [s.customer({ paymentMethod: "success" })],
		actions: [],
	});
	const subscription = await createExternalSubscription({
		customerId,
		items: [{ price: sharedPrice.id }],
		currency: "eur",
	});

	const proposal = await syncSubscription({
		autumnV1,
		customerId,
		subscription,
	});
	const currentPlan = proposal.match.phaseMatches.find(
		(phase) => phase.is_current,
	)?.plans[0];
	expect(currentPlan?.base.kind).toBe("custom");
	expect(currentPlan?.customize?.price).toEqual({
		amount: 18,
		interval: BillingInterval.Month,
		interval_count: 3,
		base_currency: "eur",
		stripe_price_id: sharedPrice.id,
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId: planId,
	});
	if (!customerProduct) throw new Error(`${planId} was not synced`);
	const customBase = customerProductToBasePrice({
		customerProduct,
		errorOnNotFound: true,
	});
	expect(customBase).toMatchObject({
		is_custom: true,
		config: {
			amount: 18,
			interval_count: 3,
			base_currency: "eur",
			stripe_price_id: sharedPrice.id,
		},
	});

	await syncSubscription({ autumnV1, customerId, subscription });
	const resyncedCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const linkedProducts = filterCustomerProductsByStripeSubscriptionId({
		customerProducts: resyncedCustomer.customer_products,
		stripeSubscriptionId: subscription.id,
	});
	const activeProducts = filterCustomerProductsByActiveStatuses({
		customerProducts: linkedProducts,
	});
	expect(activeProducts).toHaveLength(1);
	expect(
		customerProductToBasePrice({
			customerProduct: activeProducts[0]!,
			errorOnNotFound: true,
		}).id,
	).toBe(customBase.id);
});

test(`${chalk.yellowBright("sync multi-currency: existing USD customer rejects an EUR subscription")}`, async () => {
	const planId = uniqueId("sync_mc_mismatch");
	await createPlan({ planId });
	const product = await initializeCurrency({ planId, currency: "eur" });
	const { customerId, autumnV1 } = await initScenario({
		customerId: uniqueId("sync-mc-mismatch-customer"),
		setup: [
			s.customer({ paymentMethod: "success", data: { currency: "usd" } }),
		],
		actions: [],
	});
	const subscription = await createExternalSubscription({
		customerId,
		items: [
			{
				price: priceIdForCurrency({ product, currency: "eur", kind: "fixed" }),
			},
		],
	});
	const { params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
	});

	await expectAutumnError({
		errCode: ErrCode.CurrencyMismatch,
		func: () => autumnV1.post("/billing.sync_v2", params),
	});
});

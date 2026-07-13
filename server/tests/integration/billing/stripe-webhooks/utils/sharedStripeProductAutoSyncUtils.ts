import { expect } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	CusProductStatus,
	cusProductToPrices,
	findPriceByFeatureId,
	type FullProduct,
	type FullCusProduct,
	isFixedPrice,
	type Price,
	ProductItemFeatureType,
	type ProductV2,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectCustomerProducts,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { createStripeFixedPriceUnderProduct } from "@tests/integration/billing/sync/utils/syncProductHelpers";
import { createVariantPlan } from "@tests/integration/crud/plans/variants/utils/variantTestPlanUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import testCtx, {
	type TestContext,
} from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { ProductService } from "@/internal/products/ProductService";

export type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;

export const apiUsageItem = ({
	included,
	amount,
	featureId = TestFeature.Messages,
}: {
	included: number;
	amount: number;
	featureId?: TestFeature;
}) => ({
	feature_id: featureId,
	feature_type: ProductItemFeatureType.SingleUse,
	included,
	reset: { interval: ResetInterval.Month },
	price: {
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.UsageBased,
		billing_units: 1000,
	},
});

export const getFullProduct = ({
	ctx,
	productId,
}: {
	ctx: TestContext;
	productId: string;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

export const requireBasePrice = ({ fullProduct }: { fullProduct: FullProduct }) => {
	const price = fullProduct.prices.find(isFixedPrice);
	if (!price) throw new Error(`Product ${fullProduct.id} has no base price`);
	return price;
};

export const requireUsagePrice = ({ fullProduct }: { fullProduct: FullProduct }) => {
	const price = findPriceByFeatureId({
		prices: fullProduct.prices,
		featureId: TestFeature.Messages,
	});
	if (!price) throw new Error(`Product ${fullProduct.id} has no usage price`);
	return price;
};

export const stripePriceIdForPrice = ({ price }: { price: Price }) => {
	const stripePriceId =
		price.config.stripe_price_id ?? price.config.stripe_empty_price_id;
	if (!stripePriceId) throw new Error(`Price ${price.id} has no Stripe price`);
	return stripePriceId;
};

export const getStripeCustomerId = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) {
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	}
	return stripeCustomerId;
};

export const createExternalStripeSubscription = async ({
	ctx,
	customerId,
	items,
}: {
	ctx: TestContext;
	customerId: string;
	items: Stripe.SubscriptionCreateParams.Item[];
}) => {
	const stripeCustomerId = await getStripeCustomerId({ ctx, customerId });
	return ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items,
	});
};

export const waitForCustomerProducts = async ({
	autumnV1,
	customerId,
	active,
	notPresent = [],
	label,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	customerId: string;
	active: string[];
	notPresent?: string[];
	label?: string;
}) => {
	const deadline = Date.now() + 60_000;
	let lastError: unknown;
	let lastCustomer: ApiCustomerV3 | undefined;

	while (Date.now() < deadline) {
		try {
			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			lastCustomer = customer;
			await expectCustomerProducts({ customer, active, notPresent });
			return customer;
		} catch (error) {
			lastError = error;
			await timeout(2_000);
		}
	}

	const actualProducts = (lastCustomer?.products ?? [])
		.map((product) => `${product.id}:${product.status}`)
		.join(", ");
	const message =
		lastError instanceof Error ? lastError.message : String(lastError);
	throw new Error(
		`waitForCustomerProducts${label ? ` [${label}]` : ""} timed out for ${customerId}: ${message} — actual products: [${actualProducts}]`,
	);
};

export const trackCustomerUsage = async ({
	autumnV1,
	customerId,
	featureId,
	value,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	customerId: string;
	featureId: TestFeature;
	value: number;
}) => {
	await autumnV1.track({
		customer_id: customerId,
		feature_id: featureId,
		value,
	}, { skipCache: true });

	const deadline = Date.now() + 35_000;
	let lastError: unknown;

	while (Date.now() < deadline) {
		try {
			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
				skip_cache: "true",
			});
			expectCustomerFeatureCorrect({
				customer,
				featureId,
				usage: value,
			});
			return customer;
		} catch (error) {
			lastError = error;
			await timeout(2_000);
		}
	}

	throw lastError ?? new Error(`Timed out waiting for ${featureId} usage`);
};

export const createStripeMeteredPriceUnderProduct = async ({
	ctx,
	stripeProductId,
	unitAmountDecimal,
}: {
	ctx: TestContext;
	stripeProductId: string;
	unitAmountDecimal: string;
}) => {
	const meter = await ctx.stripeCli.billing.meters.create({
		display_name: `Wrong usage ${stripeProductId}`,
		event_name: `wrong_usage_${stripeProductId}_${Date.now()}`,
		default_aggregation: { formula: "sum" },
	});

	return ctx.stripeCli.prices.create({
		product: stripeProductId,
		currency: "usd",
		unit_amount_decimal: unitAmountDecimal,
		recurring: {
			interval: "month",
			usage_type: "metered",
			meter: meter.id,
		},
	});
};

export const createCustomBasePriceForProduct = async ({
	ctx,
	fullProduct,
	amount,
}: {
	ctx: TestContext;
	fullProduct: FullProduct;
	amount: number;
}) =>
	createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: fullProduct.processor!.id,
		unitAmount: amount * 100,
	});

export const findSubscriptionItemByStripeProductId = ({
	subscription,
	stripeProductId,
}: {
	subscription: Stripe.Subscription;
	stripeProductId: string;
}) => {
	const item = subscription.items.data.find((item) => {
		const product = item.price.product;
		const productId = typeof product === "string" ? product : product.id;
		return productId === stripeProductId;
	});
	if (!item) {
		throw new Error(
			`Subscription ${subscription.id} has no item for product ${stripeProductId}`,
		);
	}
	return item;
};

export const retrieveStripeSubscription = ({
	ctx,
	subscriptionId,
}: {
	ctx: TestContext;
	subscriptionId: string;
}) => ctx.stripeCli.subscriptions.retrieve(subscriptionId);

export const expectLinkedCustomerProduct = async ({
	ctx,
	stripeSubscriptionId,
	productId,
}: {
	ctx: TestContext;
	stripeSubscriptionId: string;
	productId: string;
}) => {
	const linked = await CusProductService.getByStripeSubId({
		db: ctx.db,
		stripeSubId: stripeSubscriptionId,
		orgId: ctx.org.id,
		env: ctx.env,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
	});
	expect(linked).toHaveLength(1);
	expect(linked[0]?.product_id).toBe(productId);
	expect(linked[0]?.subscription_ids).toContain(stripeSubscriptionId);
	return linked[0] as FullCusProduct;
};

export const expectActiveLinkedCustomerProducts = async ({
	ctx,
	stripeSubscriptionId,
	productIds,
}: {
	ctx: TestContext;
	stripeSubscriptionId: string;
	productIds: string[];
}) => {
	const linked = await CusProductService.getByStripeSubId({
		db: ctx.db,
		stripeSubId: stripeSubscriptionId,
		orgId: ctx.org.id,
		env: ctx.env,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
	});
	expect(linked.map((cp) => cp.product_id).sort()).toEqual([...productIds].sort());
	return linked;
};

export const expectNoLinkedCustomerProduct = async ({
	ctx,
	stripeSubscriptionId,
}: {
	ctx: TestContext;
	stripeSubscriptionId: string;
}) => {
	const linked = await CusProductService.getByStripeSubId({
		db: ctx.db,
		stripeSubId: stripeSubscriptionId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	expect(linked).toHaveLength(0);
};

export const createSharedStripeVariant = async ({
	rpc,
	basePlanId,
	variantPlanId,
	variantIncluded,
	variantAmount = 35,
	featureId = TestFeature.Messages,
	name,
}: {
	rpc: AutumnRpcCli;
	basePlanId: string;
	variantPlanId: string;
	variantIncluded: number;
	variantAmount?: number;
	featureId?: TestFeature;
	name: string;
}) => {
	await createVariantPlan({
		rpc,
		basePlanId,
		variantPlanId,
		name,
	});
	await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantPlanId, {
		price: { amount: variantAmount, interval: BillingInterval.Month },
		items: [
			apiUsageItem({
				included: variantIncluded,
				amount: 0.8,
				featureId,
			}),
		],
		disable_version: true,
	});
};

export const setupSharedStripeProductFamily = async ({
	customerId,
	baseId,
	variantId,
	variantIncluded,
	ambiguousVariantId,
	ambiguousVariantIncluded,
}: {
	customerId: string;
	baseId: string;
	variantId: string;
	variantIncluded: number;
	ambiguousVariantId?: string;
	ambiguousVariantIncluded?: number;
}) => {
	const base = products.base({
		id: baseId,
		items: [
			items.monthlyPrice({ price: 20 }),
			{
				...items.consumableMessages({
					includedUsage: 50_000,
					price: 0.9,
				}),
				feature_type: ProductItemFeatureType.SingleUse,
			},
		],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		ctx: testCtx,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});

	await createSharedStripeVariant({
		rpc,
		basePlanId: base.id,
		variantPlanId: variantId,
		variantIncluded,
		name: "Shared Stripe Product Variant",
	});
	if (ambiguousVariantId) {
		await createSharedStripeVariant({
			rpc,
			basePlanId: base.id,
			variantPlanId: ambiguousVariantId,
			variantIncluded: ambiguousVariantIncluded ?? variantIncluded,
			name: "Shared Stripe Product Ambiguous Variant",
		});
	}

	const baseFull = await getFullProduct({ ctx, productId: base.id });
	const variantFull = await getFullProduct({ ctx, productId: variantId });
	const ambiguousVariantFull = ambiguousVariantId
		? await getFullProduct({ ctx, productId: ambiguousVariantId })
		: undefined;

	return { autumnV1, ctx, baseFull, variantFull, ambiguousVariantFull };
};

export type VariantSpec = {
	id: string;
	amount: number;
	included: number;
};

export type FamilySpec = {
	baseId: string;
	group: string;
	baseAmount: number;
	featureId: TestFeature;
	baseIncluded: number;
	variants: VariantSpec[];
};

export const usageItemForFeature = ({
	featureId,
	included,
	price,
}: {
	featureId: TestFeature;
	included: number;
	price: number;
}) => {
	if (featureId === TestFeature.Words) {
		return items.consumableWords({ includedUsage: included });
	}

	return {
		...items.consumable({
			featureId,
			includedUsage: included,
			price,
		}),
		feature_type: ProductItemFeatureType.SingleUse,
	};
};

export const setupSharedStripeFamilies = async ({
	customerId,
	families,
	additionalProducts = [],
}: {
	customerId: string;
	families: FamilySpec[];
	additionalProducts?: ProductV2[];
}) => {
	const bases = families.map((family) =>
		products.base({
			id: family.baseId,
			group: family.group,
			items: [
				items.monthlyPrice({ price: family.baseAmount }),
				usageItemForFeature({
					featureId: family.featureId,
					included: family.baseIncluded,
					price: 0.9,
				}),
			],
		}),
	);

	const { autumnV1, ctx } = await initScenario({
		customerId,
		ctx: testCtx,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [...bases, ...additionalProducts], prefix: "" }),
		],
		actions: [],
	});

	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});

	for (const family of families) {
		for (const variant of family.variants) {
			await createSharedStripeVariant({
				rpc,
				basePlanId: family.baseId,
				variantPlanId: variant.id,
				variantIncluded: variant.included,
				variantAmount: variant.amount,
				featureId: family.featureId,
				name: `${family.group} ${variant.id}`,
			});
		}
	}

	const fullProducts = new Map<string, FullProduct>();
	for (const family of families) {
		fullProducts.set(
			family.baseId,
			await getFullProduct({ ctx, productId: family.baseId }),
		);
		for (const variant of family.variants) {
			fullProducts.set(
				variant.id,
				await getFullProduct({ ctx, productId: variant.id }),
			);
		}
	}

	return { autumnV1, ctx, fullProducts };
};

export const getFullProductFromMap = ({
	fullProducts,
	productId,
}: {
	fullProducts: Map<string, FullProduct>;
	productId: string;
}) => {
	const fullProduct = fullProducts.get(productId);
	if (!fullProduct) throw new Error(`Missing full product ${productId}`);
	return fullProduct;
};

export const expectStripeSubscriptionCreated = ({
	subscription,
}: {
	subscription: Stripe.Subscription;
}) => {
	expect(subscription.id).toStartWith("sub_");
	expect(subscription.status).toBe("active");
	expect(subscription.items.data.length).toBeGreaterThan(0);
};

export const createWrongUsagePrice = async ({
	ctx,
	fullProduct,
}: {
	ctx: TestContext;
	fullProduct: FullProduct;
}) => {
	const usagePrice = requireUsagePrice({ fullProduct });
	const stripeProductId = usagePrice.config.stripe_product_id;
	if (!stripeProductId) {
		throw new Error(`Usage price ${usagePrice.id} has no Stripe product ID`);
	}
	return createStripeMeteredPriceUnderProduct({
		ctx,
		stripeProductId,
		unitAmountDecimal: "1",
	});
};

export const updateBaseSubscriptionItemToVariant = async ({
	ctx,
	subscription,
	fromFullProduct,
	toFullProduct,
	toAmount,
}: {
	ctx: TestContext;
	subscription: Stripe.Subscription;
	fromFullProduct: FullProduct;
	toFullProduct: FullProduct;
	toAmount: number;
}) => {
	const item = findSubscriptionItemByStripeProductId({
		subscription,
		stripeProductId: fromFullProduct.processor!.id,
	});
	const newPrice = await createCustomBasePriceForProduct({
		ctx,
		fullProduct: toFullProduct,
		amount: toAmount,
	});
	await ctx.stripeCli.subscriptionItems.update(item.id, {
		price: newPrice.id,
		proration_behavior: "none",
	});
	return retrieveStripeSubscription({ ctx, subscriptionId: subscription.id });
};

export const addVariantBaseItemToSubscription = async ({
	ctx,
	subscription,
	fullProduct,
	amount,
}: {
	ctx: TestContext;
	subscription: Stripe.Subscription;
	fullProduct: FullProduct;
	amount: number;
}) => {
	const price = await createCustomBasePriceForProduct({
		ctx,
		fullProduct,
		amount,
	});
	await ctx.stripeCli.subscriptions.update(subscription.id, {
		items: [{ price: price.id }],
		proration_behavior: "none",
	});
	return retrieveStripeSubscription({ ctx, subscriptionId: subscription.id });
};

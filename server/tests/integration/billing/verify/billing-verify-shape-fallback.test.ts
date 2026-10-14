import { expect, test } from "bun:test";
import {
	cusPriceToCusEntWithCusProduct,
	findPriceByFeatureId,
	isFixedPrice,
	isPrepaidPrice,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { verify } from "@/internal/billing/v2/actions/verify/verify";
import { cusEntToInlineStripePrice } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/cusPriceToStripeItemSpec/cusEntToInlineStripePrice";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import {
	corruptStripeSubscription,
	listActiveStripeSubscriptions,
} from "../restore/utils/corruptStripeSubscription";

const stripeCustomerIdFor = async ({
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
	if (!stripeCustomerId)
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	return stripeCustomerId;
};

const basePriceIdFor = async ({
	ctx,
	productId,
}: {
	ctx: TestContext;
	productId: string;
}) => {
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	for (const price of fullProduct.prices) {
		if (price.config.feature_id) continue;
		const id =
			price.config.stripe_price_id ?? price.config.stripe_empty_price_id;
		if (id) return id;
	}
	throw new Error(`No base Stripe price id on product ${productId}`);
};

const createDriftedClone = async ({
	ctx,
	item,
	unitAmountDecimal,
}: {
	ctx: TestContext;
	item: Stripe.SubscriptionItem;
	unitAmountDecimal?: string;
}) =>
	ctx.stripeCli.prices.create({
		product: item.price.product as string,
		currency: item.price.currency,
		unit_amount_decimal:
			unitAmountDecimal ??
			item.price.unit_amount_decimal ??
			`${item.price.unit_amount}`,
		recurring: {
			interval: item.price.recurring?.interval ?? "month",
			interval_count: item.price.recurring?.interval_count ?? 1,
		},
		nickname: "drifted-clone",
	});

test.concurrent(
	`${chalk.yellowBright("billing-verify shape-fallback 1: base price id drifted, same shape -> correct non-strict, mismatched strict")}`,
	async () => {
		const customerId = "verify-shape-fallback-base";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 200 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const basePriceId = await basePriceIdFor({ ctx, productId: pro.id });
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		const baseItem = sub.items.data.find(
			(item) => item.price.id === basePriceId,
		);
		if (!baseItem) throw new Error("Expected the base item on the sub");

		const drifted = await createDriftedClone({ ctx, item: baseItem });
		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				removeItemPriceIds: [basePriceId],
				addItems: [{ price: drifted.id, quantity: 1 }],
			},
		});

		const lenient = await verify({ ctx, params: { customer_id: customerId } });
		expect(lenient.subscriptions.length).toBe(1);
		expect(lenient.subscriptions[0].mismatches).toEqual([]);
		expect(lenient.subscriptions[0].status).toBe("correct");

		const strict = await verify({
			ctx,
			params: { customer_id: customerId, strict: true },
		});
		expect(strict.subscriptions[0].status).toBe("mismatched");
		expect(strict.subscriptions[0].mismatches).toMatchObject([
			{ type: "base_price_mismatch", reason: "missing" },
			{ type: "item_mismatch", reason: "unexpected" },
		]);

		const unexpected = strict.subscriptions[0].mismatches.find(
			(mismatch) => mismatch.type === "item_mismatch",
		);
		const baseAmount = (baseItem.price.unit_amount ?? 0) / 100;
		expect(unexpected?.message).toBe(
			`Stripe price unmatched — $${baseAmount}/mo not in Autumn (${drifted.id})`,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify shape-fallback 2: base price drifted to a different amount -> still mismatched non-strict")}`,
	async () => {
		const customerId = "verify-shape-fallback-amount";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 200 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const basePriceId = await basePriceIdFor({ ctx, productId: pro.id });
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		const baseItem = sub.items.data.find(
			(item) => item.price.id === basePriceId,
		);
		if (!baseItem) throw new Error("Expected the base item on the sub");

		const drifted = await createDriftedClone({
			ctx,
			item: baseItem,
			unitAmountDecimal: `${(baseItem.price.unit_amount ?? 0) + 100}`,
		});
		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				removeItemPriceIds: [basePriceId],
				addItems: [{ price: drifted.id, quantity: 1 }],
			},
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });
		expect(result.subscriptions[0].status).toBe("mismatched");
		const missing = result.subscriptions[0].mismatches.find(
			(mismatch) =>
				mismatch.type === "base_price_mismatch" &&
				mismatch.reason === "missing",
		);
		expect(missing).toBeDefined();

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const baseAmount = (baseItem.price.unit_amount ?? 0) / 100;
		expect(missing?.message).toBe(
			`Base price unmatched — ${fullProduct.name} $${baseAmount}/mo: expected 1, Stripe has 0 (${basePriceId})`,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify shape-fallback 3: prepaid price id drifted, same shape -> correct; quantity drift still reported")}`,
	async () => {
		const customerId = "verify-shape-fallback-prepaid";

		const prepaidItem = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro", items: [prepaidItem] });

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
			],
		});

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const prepaidPrice = findPriceByFeatureId({
			prices: fullProduct.prices,
			featureId: TestFeature.Messages,
		});
		if (!prepaidPrice) throw new Error("Expected a prepaid price on pro");
		const prepaidStripeIds = new Set(
			[
				prepaidPrice.config.stripe_price_id,
				prepaidPrice.config.stripe_empty_price_id,
				(prepaidPrice.config as { stripe_prepaid_price_v2_id?: string | null })
					.stripe_prepaid_price_v2_id,
			].filter((id): id is string => !!id),
		);

		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		const prepaidSubItem = sub.items.data.find((item) =>
			prepaidStripeIds.has(item.price.id),
		);
		if (!prepaidSubItem) throw new Error("Expected a prepaid item on the sub");

		const drifted = await createDriftedClone({ ctx, item: prepaidSubItem });
		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				removeItemPriceIds: [prepaidSubItem.price.id],
				addItems: [
					{ price: drifted.id, quantity: prepaidSubItem.quantity ?? 1 },
				],
			},
		});

		const lenient = await verify({ ctx, params: { customer_id: customerId } });
		expect(lenient.subscriptions.length).toBe(1);
		expect(lenient.subscriptions[0].mismatches).toEqual([]);
		expect(lenient.subscriptions[0].status).toBe("correct");

		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				setItemQuantities: [
					{
						priceId: drifted.id,
						quantity: (prepaidSubItem.quantity ?? 1) + 1,
					},
				],
			},
		});
		const drifted2 = await verify({ ctx, params: { customer_id: customerId } });
		expect(drifted2.subscriptions[0].status).toBe("mismatched");
		expect(drifted2.subscriptions[0].mismatches).toMatchObject([
			{
				type: "prepaid_quantity_mismatch",
				feature_id: TestFeature.Messages,
				expected_quantity: prepaidSubItem.quantity ?? 1,
				actual_quantity: (prepaidSubItem.quantity ?? 1) + 1,
			},
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify shape-fallback 5: prepaid restructured at same total -> matched by totals non-strict")}`,
	async () => {
		const customerId = "verify-shape-fallback-totals";

		const prepaidItem = items.prepaidMessages({
			includedUsage: 100,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro", items: [prepaidItem] });

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
			],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const cusProduct = fullCustomer.customer_products.find(
			(candidate) => candidate.product_id === pro.id,
		);
		const prepaidCusPrice = cusProduct?.customer_prices.find((cusPrice) =>
			isPrepaidPrice(cusPrice.price),
		);
		if (!cusProduct || !prepaidCusPrice)
			throw new Error("Expected a prepaid cus price on pro");
		const cusEnt = cusPriceToCusEntWithCusProduct({
			cusProduct,
			cusPrice: prepaidCusPrice,
			cusEnts: cusProduct.customer_entitlements,
		});
		if (!cusEnt) throw new Error("Expected a cus ent for the prepaid price");
		const expectedTotal = cusEntToInlineStripePrice({
			cusEnt,
			org: ctx.org,
		}).unit_amount_decimal;

		const prepaidStripeIds = new Set(
			[
				prepaidCusPrice.price.config.stripe_price_id,
				(
					prepaidCusPrice.price.config as {
						stripe_prepaid_price_v2_id?: string | null;
					}
				).stripe_prepaid_price_v2_id,
			].filter((id): id is string => !!id),
		);
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		const prepaidSubItem = sub.items.data.find((item) =>
			prepaidStripeIds.has(item.price.id),
		);
		if (!prepaidSubItem) throw new Error("Expected a prepaid item on the sub");

		const flat = await ctx.stripeCli.prices.create({
			product: prepaidSubItem.price.product as string,
			currency: prepaidSubItem.price.currency,
			unit_amount_decimal: expectedTotal,
			recurring: { interval: "month", interval_count: 1 },
			nickname: "restructured-flat",
		});
		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				removeItemPriceIds: [prepaidSubItem.price.id],
				addItems: [{ price: flat.id, quantity: 1 }],
			},
		});

		const lenient = await verify({ ctx, params: { customer_id: customerId } });
		expect(lenient.subscriptions[0].mismatches).toEqual([]);
		expect(lenient.subscriptions[0].status).toBe("correct");

		const strict = await verify({
			ctx,
			params: { customer_id: customerId, strict: true },
		});
		expect(strict.subscriptions[0].status).toBe("mismatched");

		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: { setItemQuantities: [{ priceId: flat.id, quantity: 2 }] },
		});
		const drifted = await verify({ ctx, params: { customer_id: customerId } });
		expect(drifted.subscriptions[0].status).toBe("mismatched");
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify shape-fallback 8: tiered items skip only when the tier total is $0")}`,
	async () => {
		const customerId = "verify-shape-fallback-tiered-zero";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 200 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const basePriceId = await basePriceIdFor({ ctx, productId: pro.id });
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		const baseItem = sub.items.data.find(
			(item) => item.price.id === basePriceId,
		);
		if (!baseItem) throw new Error("Expected the base item on the sub");

		const zeroResolving = await ctx.stripeCli.prices.create({
			product: baseItem.price.product as string,
			currency: baseItem.price.currency,
			billing_scheme: "tiered",
			tiers_mode: "volume",
			tiers: [
				{ up_to: 100000, unit_amount: 0 },
				{ up_to: "inf", unit_amount: 100 },
			],
			recurring: { interval: "month", interval_count: 1 },
			nickname: "stale-tiered-free",
		});
		const billing = await ctx.stripeCli.prices.create({
			product: baseItem.price.product as string,
			currency: baseItem.price.currency,
			billing_scheme: "tiered",
			tiers_mode: "volume",
			tiers: [
				{ up_to: 100, unit_amount: 0 },
				{ up_to: "inf", unit_amount: 500 },
			],
			recurring: { interval: "month", interval_count: 1 },
			nickname: "stale-tiered-paid",
		});
		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				addItems: [
					{ price: zeroResolving.id, quantity: 10000 },
					{ price: billing.id, quantity: 200 },
				],
			},
		});

		const lenient = await verify({ ctx, params: { customer_id: customerId } });
		expect(lenient.subscriptions[0].status).toBe("mismatched");
		expect(lenient.subscriptions[0].mismatches).toMatchObject([
			{
				type: "item_mismatch",
				reason: "unexpected",
				actual_price_id: billing.id,
			},
		]);

		const strict = await verify({
			ctx,
			params: { customer_id: customerId, strict: true },
		});
		expect(strict.subscriptions[0].mismatches).toHaveLength(2);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify shape-fallback 7: fixed drift onto a different Stripe product, same shape -> matched non-strict")}`,
	async () => {
		const customerId = "verify-shape-fallback-xproduct";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 200 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const basePriceId = await basePriceIdFor({ ctx, productId: pro.id });
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		const baseItem = sub.items.data.find(
			(item) => item.price.id === basePriceId,
		);
		if (!baseItem) throw new Error("Expected the base item on the sub");

		const foreign = await ctx.stripeCli.prices.create({
			product_data: { name: "Legacy Enterprise" },
			currency: baseItem.price.currency,
			unit_amount_decimal:
				baseItem.price.unit_amount_decimal ?? `${baseItem.price.unit_amount}`,
			recurring: {
				interval: baseItem.price.recurring?.interval ?? "month",
				interval_count: baseItem.price.recurring?.interval_count ?? 1,
			},
			nickname: "legacy-product-clone",
		});
		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				removeItemPriceIds: [basePriceId],
				addItems: [{ price: foreign.id, quantity: 1 }],
			},
		});

		const lenient = await verify({ ctx, params: { customer_id: customerId } });
		expect(lenient.subscriptions[0].mismatches).toEqual([]);
		expect(lenient.subscriptions[0].status).toBe("correct");

		const strict = await verify({
			ctx,
			params: { customer_id: customerId, strict: true },
		});
		expect(strict.subscriptions[0].status).toBe("mismatched");
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify shape-fallback 6: fixed qty split across stored + legacy items -> aggregate matches")}`,
	async () => {
		const customerId = "verify-shape-fallback-split";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 200 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		const basePriceId = await basePriceIdFor({ ctx, productId: pro.id });
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		const baseItem = sub.items.data.find(
			(item) => item.price.id === basePriceId,
		);
		if (baseItem?.quantity !== 2)
			throw new Error(
				`Expected a consolidated qty-2 base item, got ${baseItem?.quantity}`,
			);

		const legacy = await createDriftedClone({ ctx, item: baseItem });
		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				setItemQuantities: [{ priceId: basePriceId, quantity: 1 }],
				addItems: [{ price: legacy.id, quantity: 1 }],
			},
		});

		const lenient = await verify({ ctx, params: { customer_id: customerId } });
		expect(lenient.subscriptions[0].mismatches).toEqual([]);
		expect(lenient.subscriptions[0].status).toBe("correct");

		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: { setItemQuantities: [{ priceId: legacy.id, quantity: 2 }] },
		});
		const drifted = await verify({ ctx, params: { customer_id: customerId } });
		expect(drifted.subscriptions[0].status).toBe("mismatched");
		expect(drifted.subscriptions[0].mismatches).toMatchObject([
			{
				type: "item_mismatch",
				reason: "quantity_mismatch",
				expected_quantity: 2,
				actual_quantity: 3,
			},
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify shape-fallback 4: unexpected $0 licensed item -> skipped non-strict, reported strict")}`,
	async () => {
		const customerId = "verify-shape-fallback-zero";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 200 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const basePriceId = await basePriceIdFor({ ctx, productId: pro.id });
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		const baseItem = sub.items.data.find(
			(item) => item.price.id === basePriceId,
		);
		if (!baseItem) throw new Error("Expected the base item on the sub");

		const zeroPrice = await createDriftedClone({
			ctx,
			item: baseItem,
			unitAmountDecimal: "0",
		});
		const tieredPrice = await ctx.stripeCli.prices.create({
			product: baseItem.price.product as string,
			currency: baseItem.price.currency,
			billing_scheme: "tiered",
			tiers_mode: "volume",
			tiers: [
				{ up_to: 100, unit_amount: 500 },
				{ up_to: "inf", unit_amount: 300 },
			],
			recurring: { interval: "month", interval_count: 1 },
			nickname: "stale-tiered",
		});
		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				addItems: [
					{ price: zeroPrice.id, quantity: 1 },
					{ price: tieredPrice.id, quantity: 0 },
				],
			},
		});

		const lenient = await verify({ ctx, params: { customer_id: customerId } });
		expect(lenient.subscriptions.length).toBe(1);
		expect(lenient.subscriptions[0].mismatches).toEqual([]);
		expect(lenient.subscriptions[0].status).toBe("correct");

		const strict = await verify({
			ctx,
			params: { customer_id: customerId, strict: true },
		});
		expect(strict.subscriptions[0].status).toBe("mismatched");
		expect(strict.subscriptions[0].mismatches).toMatchObject([
			{ type: "item_mismatch", reason: "unexpected" },
			{ type: "item_mismatch", reason: "unexpected" },
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify shape-fallback 9: consolidated qty split across two identity-tagged items -> aggregate matches")}`,
	async () => {
		const customerId = "verify-identity-siblings";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 200 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const baseCusPriceIds = fullCustomer.customer_products
			.filter((cusProduct) => cusProduct.product_id === pro.id)
			.map(
				(cusProduct) =>
					cusProduct.customer_prices.find((cusPrice) =>
						isFixedPrice(cusPrice.price),
					)?.id,
			)
			.filter((id): id is string => !!id);
		expect(baseCusPriceIds).toHaveLength(2);

		const basePriceId = await basePriceIdFor({ ctx, productId: pro.id });
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		const baseItem = sub.items.data.find(
			(item) => item.price.id === basePriceId,
		);
		if (baseItem?.quantity !== 2)
			throw new Error(
				`Expected a consolidated qty-2 base item, got ${baseItem?.quantity}`,
			);

		const legacy = await createDriftedClone({ ctx, item: baseItem });
		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				removeItemPriceIds: [basePriceId],
				addItems: [
					{
						price: legacy.id,
						quantity: 1,
						metadata: { autumn_customer_price_id: baseCusPriceIds[0] },
					},
					{
						price: basePriceId,
						quantity: 1,
						metadata: { autumn_customer_price_id: baseCusPriceIds[1] },
					},
				],
			},
		});

		const lenient = await verify({ ctx, params: { customer_id: customerId } });
		expect(lenient.subscriptions[0].mismatches).toEqual([]);
		expect(lenient.subscriptions[0].status).toBe("correct");

		const strict = await verify({
			ctx,
			params: { customer_id: customerId, strict: true },
		});
		expect(strict.subscriptions[0].mismatches).toEqual([]);

		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: { removeItemPriceIds: [legacy.id] },
		});
		const short = await verify({ ctx, params: { customer_id: customerId } });
		expect(short.subscriptions[0].status).toBe("mismatched");
		expect(short.subscriptions[0].mismatches).toMatchObject([
			{ expected_quantity: 2, actual_quantity: 1 },
		]);
	},
);

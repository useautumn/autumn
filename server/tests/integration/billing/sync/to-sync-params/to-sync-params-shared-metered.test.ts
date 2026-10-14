import { expect, test } from "bun:test";
import { isUsagePrice, type UsagePriceConfig } from "@autumn/shared";
import { expectSubscriptionMatchCorrect } from "@tests/integration/billing/utils/sync/expectSubscriptionMatch";
import { expectSyncParamsCorrect } from "@tests/integration/billing/utils/sync/expectSyncParams";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";
import { PriceService } from "@/internal/products/prices/PriceService";
import {
	fetchFullProduct,
	getBaseStripePriceId,
	getStripeCustomerId,
} from "../utils/syncProductHelpers";

const initSharedMeteredScenario = async ({
	customerId,
	proId,
	scaleId,
}: {
	customerId: string;
	proId: string;
	scaleId: string;
}) => {
	const pro = products.pro({
		id: proId,
		items: [items.consumableMessages({ price: 0.1 })],
	});
	const scale = products.premium({
		id: scaleId,
		items: [items.consumableMessages({ price: 0.1 })],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, scale] }),
		],
		actions: [],
	});

	const sharedStripeProduct = await ctx.stripeCli.products.create({
		name: `Shared Metered ${proId}`,
	});
	const meter = await ctx.stripeCli.billing.meters.create({
		display_name: `Shared metered ${proId}`,
		event_name: `shared_metered_${proId}_${Date.now()}`,
		default_aggregation: { formula: "sum" },
	});
	const sharedMeteredPrice = await ctx.stripeCli.prices.create({
		product: sharedStripeProduct.id,
		currency: "usd",
		unit_amount: 10,
		recurring: { interval: "month", usage_type: "metered", meter: meter.id },
	});

	for (const productId of [pro.id, scale.id]) {
		const fullProduct = await fetchFullProduct({ ctx, productId });
		const usagePrice = fullProduct.prices.find((price) =>
			isUsagePrice({ price }),
		);
		if (!usagePrice) throw new Error(`${productId} has no usage price`);
		await PriceService.updateConfig({
			db: ctx.db,
			id: usagePrice.id,
			config: {
				...(usagePrice.config as UsagePriceConfig),
				stripe_price_id: sharedMeteredPrice.id,
				stripe_product_id: sharedStripeProduct.id,
			},
		});
	}
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });

	return { pro, scale, sharedMeteredPrice };
};

const createSubscription = async ({
	customerId,
	stripePriceIds,
}: {
	customerId: string;
	stripePriceIds: string[];
}): Promise<Stripe.Subscription> => {
	const stripeCustomerId = await getStripeCustomerId({ ctx, customerId });
	return ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: stripePriceIds.map((price) => ({ price })),
	});
};

test.concurrent(
	`${chalk.yellowBright("shared-metered: case 1 — shared item follows the anchored scale plan")}`,
	async () => {
		const customerId = "shared-metered-1-scale";
		const proId = "shared-metered-1-pro";
		const scaleId = "shared-metered-1-scale-plan";

		const { scale, sharedMeteredPrice } = await initSharedMeteredScenario({
			customerId,
			proId,
			scaleId,
		});

		const scaleFull = await fetchFullProduct({ ctx, productId: scale.id });
		const subscription = await createSubscription({
			customerId,
			stripePriceIds: [
				getBaseStripePriceId({ fullProduct: scaleFull }),
				sharedMeteredPrice.id,
			],
		});

		const { match, params } = await subscriptionToSyncParams({
			ctx,
			customerId,
			subscription,
		});

		expectSubscriptionMatchCorrect({
			match,
			currentPhase: {
				plans: [{ plan_id: scale.id, base_kind: "matched" }],
				noUnmatchedItems: true,
			},
		});

		const currentPhase = match.phaseMatches.find((phase) => phase.is_current);
		expect(currentPhase?.plans[0]?.features).toHaveLength(1);

		expectSyncParamsCorrect({
			params,
			customer_id: customerId,
			stripe_subscription_id: subscription.id,
			phases: [
				{
					starts_at: "now",
					plans: [{ plan_id: scale.id, quantity: 1, customize: null }],
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("shared-metered: case 2 — shared item follows the anchored pro plan")}`,
	async () => {
		const customerId = "shared-metered-2-pro";
		const proId = "shared-metered-2-pro-plan";
		const scaleId = "shared-metered-2-scale";

		const { pro, sharedMeteredPrice } = await initSharedMeteredScenario({
			customerId,
			proId,
			scaleId,
		});

		const proFull = await fetchFullProduct({ ctx, productId: pro.id });
		const subscription = await createSubscription({
			customerId,
			stripePriceIds: [
				getBaseStripePriceId({ fullProduct: proFull }),
				sharedMeteredPrice.id,
			],
		});

		const { match } = await subscriptionToSyncParams({
			ctx,
			customerId,
			subscription,
		});

		expectSubscriptionMatchCorrect({
			match,
			currentPhase: {
				plans: [{ plan_id: pro.id, base_kind: "matched" }],
				noUnmatchedItems: true,
			},
		});
		const currentPhase = match.phaseMatches.find((phase) => phase.is_current);
		expect(currentPhase?.plans[0]?.features).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("shared-metered: case 3 — no anchor keeps first-catalog-match fallback")}`,
	async () => {
		const customerId = "shared-metered-3-alone";
		const proId = "shared-metered-3-pro";
		const scaleId = "shared-metered-3-scale";

		const { sharedMeteredPrice } = await initSharedMeteredScenario({
			customerId,
			proId,
			scaleId,
		});

		const subscription = await createSubscription({
			customerId,
			stripePriceIds: [sharedMeteredPrice.id],
		});

		const { match } = await subscriptionToSyncParams({
			ctx,
			customerId,
			subscription,
		});

		const currentPhase = match.phaseMatches.find((phase) => phase.is_current);
		expect(currentPhase?.plans).toHaveLength(1);
		expect(currentPhase?.plans[0]?.base.kind).toBe("dropped");
	},
);

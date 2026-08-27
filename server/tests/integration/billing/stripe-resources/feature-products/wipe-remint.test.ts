/**
 * Wipe clears Autumn stripe_* ids on the same pr_*.
 * Same mint shape → Stripe replays (same Price).
 * Amount/tiers change → new idempotency key → new Price, not a reject.
 */

import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { initStripeResourcesForProducts } from "@/internal/billing/v2/providers/stripe/utils/common/initStripeResourcesForProducts.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	getFeatureRow,
	uniqueSuffix,
	usagePriceForFeature,
	wipePriceStripeIds,
} from "./utils/createUnmintedFeaturePlans.js";

test.concurrent(
	`${chalk.yellowBright("feature-products: same-shape wipe replays the Stripe Price under the same Feature product")}`,
	async () => {
		const suffix = uniqueSuffix();
		const customerId = `fp-wipe-${suffix}`;
		const pro = products.pro({
			id: `fp-wipe-pro-${suffix}`,
			items: [items.consumableMessages()],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro], createInStripe: false }),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});

		const before = await usagePriceForFeature({ ctx, productId: pro.id });
		const featureBefore = await getFeatureRow({ ctx });
		expect(featureBefore.stripe_product_id).toBeString();
		expect(before.config.stripe_price_id).toBeString();

		await wipePriceStripeIds({
			ctx,
			priceId: before.price.id!,
			config: before.config,
		});

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: pro.id,
		});
		await initStripeResourcesForProducts({
			ctx,
			products: [fullProduct],
		});

		const after = await usagePriceForFeature({ ctx, productId: pro.id });
		const featureAfter = await getFeatureRow({ ctx });

		expect(featureAfter.stripe_product_id).toBe(featureBefore.stripe_product_id);
		expect(after.config.stripe_product_id).toBe(featureBefore.stripe_product_id);
		expect(after.config.stripe_price_id).toBe(before.config.stripe_price_id);
	},
);

test.concurrent(
	`${chalk.yellowBright("feature-products: wipe + amount change remints instead of idempotency reject")}`,
	async () => {
		const suffix = uniqueSuffix();
		const customerId = `fp-wipe-amt-${suffix}`;
		const pro = products.pro({
			id: `fp-wipe-amt-pro-${suffix}`,
			items: [items.consumableMessages()],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro], createInStripe: false }),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});

		const before = await usagePriceForFeature({ ctx, productId: pro.id });
		const nextTiers = (before.config.usage_tiers ?? []).map((tier, index) =>
			index === 0 ? { ...tier, amount: (tier.amount ?? 0) + 1 } : tier,
		);
		await wipePriceStripeIds({
			ctx,
			priceId: before.price.id!,
			config: { ...before.config, usage_tiers: nextTiers },
		});

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: pro.id,
		});
		await initStripeResourcesForProducts({
			ctx,
			products: [fullProduct],
		});

		const after = await usagePriceForFeature({ ctx, productId: pro.id });
		expect(after.config.stripe_price_id).toBeString();
		expect(after.config.stripe_price_id).not.toBe(before.config.stripe_price_id);
	},
);

/**
 * TDD test: syncV2 of a sub with a CUSTOM base price must link the created
 * custom Autumn price back to its source Stripe price.
 *
 * Red-failure mode (current behavior):
 *  - Detection captures customize.price.stripe_price_id, but the
 *    BasePriceParams -> ProductItem -> Price mapping drops it, so the custom
 *    price row lands with config.stripe_price_id = null — making the customer
 *    unrenderable by verify and future billing ops.
 *
 * Green-success criteria (after fix):
 *  - The custom fixed price's config.stripe_price_id equals the Stripe price
 *    the subscription actually carries.
 */
import { expect, test } from "bun:test";
import type { SyncProposalsV2Response } from "@autumn/shared";
import { isFixedPrice } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import { getFirstStripePriceId } from "./utils/syncTestUtils";

test.concurrent(
	`${chalk.yellowBright("sync custom-base: custom price carries config.stripe_price_id")}`,
	async () => {
		const customerId = "sync-custom-base-stripe-link";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		// 1. A Stripe price on pro's Stripe product with a NON-catalog amount —
		// detection will product-match it and propose a custom base price.
		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const catalogStripePriceId = getFirstStripePriceId({ fullProduct });
		const catalogStripePrice =
			await ctx.stripeCli.prices.retrieve(catalogStripePriceId);
		const customStripePrice = await ctx.stripeCli.prices.create({
			product: catalogStripePrice.product as string,
			unit_amount: 3700,
			currency: "usd",
			recurring: { interval: "month" },
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeSubscription = await ctx.stripeCli.subscriptions.create({
			customer: fullCustomer.processor!.id,
			items: [{ price: customStripePrice.id }],
		});

		// 2. Sync through the real V2 pipeline.
		const proposalsResponse: SyncProposalsV2Response = await autumnV1.post(
			"/billing.sync_proposals_v2",
			{ customer_id: customerId },
		);
		const proposal = proposalsResponse.proposals.find(
			(candidate) => candidate.stripe_subscription_id === stripeSubscription.id,
		);
		expect(proposal).toBeDefined();
		expect(proposal!.phases[0]?.plans[0]?.customize?.price).toBeDefined();

		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: stripeSubscription.id,
			phases: proposal!.phases,
		});

		// 3. The created custom base price must link back to the Stripe price.
		const synced = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const cusProduct = synced.customer_products.find((customerProduct) =>
			customerProduct.subscription_ids?.includes(stripeSubscription.id),
		);
		expect(cusProduct).toBeDefined();

		const customBasePrice = cusProduct!.customer_prices.find(
			(customerPrice) =>
				isFixedPrice(customerPrice.price) && customerPrice.price.is_custom,
		);
		expect(customBasePrice).toBeDefined();
		// Pre-fix: null — the mappers drop the link. Post-fix: the Stripe price id.
		expect(customBasePrice!.price.config.stripe_price_id).toBe(
			customStripePrice.id,
		);

		// 4. Clean up the directly-created Stripe subscription.
		await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
	},
);

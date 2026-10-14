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
		expect(customBasePrice!.price.config.stripe_price_id).toBe(
			customStripePrice.id,
		);

		await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
	},
);

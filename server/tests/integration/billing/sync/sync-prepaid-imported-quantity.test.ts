import { expect, test } from "bun:test";
import {
	isFixedPrice,
	isPrepaidPrice,
	type SyncParamsV1,
	type SyncProposalV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";

const MESSAGES = TestFeature.Messages;

test(
	chalk.yellowBright(
		"sync-v2: imported prepaid price (Stripe qty 1) keeps granted at the allowance, no phantom +1",
	),
	async () => {
		const customerId = "sync-prepaid-imported";

		const pro = products.pro({
			id: "pro",
			items: [
				items.prepaidMessages({
					includedUsage: 5000,
					billingUnits: 1,
					price: 1,
				}),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: MESSAGES, quantity: 0 }],
				}),
			],
		});

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const prepaidPrice = fullProduct.prices.find((p) => isPrepaidPrice(p));
		const basePrice = fullProduct.prices.find((p) => isFixedPrice(p));
		const stripeProductId = prepaidPrice?.config.stripe_product_id;
		const baseStripePriceId = basePrice?.config.stripe_price_id;
		if (!stripeProductId || !baseStripePriceId) {
			throw new Error("missing stripe product/base price id");
		}

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomerId = fullCustomer.processor?.id;
		if (!stripeCustomerId) throw new Error("no stripe customer");

		const importedPrice = await ctx.stripeCli.prices.create({
			product: stripeProductId,
			currency: "usd",
			unit_amount: 100,
			recurring: { interval: "month" },
		});

		const stripeSubscription = await ctx.stripeCli.subscriptions.create({
			customer: stripeCustomerId,
			items: [
				{ price: baseStripePriceId },
				{ price: importedPrice.id, quantity: 1 },
			],
		});

		const proposalsResponse = await autumnV1.post(
			"/billing.sync_proposals_v2",
			{ customer_id: customerId },
		);
		const proposal = (proposalsResponse.proposals as SyncProposalV2[]).find(
			(p) => p.stripe_subscription_id === stripeSubscription.id,
		);
		if (!proposal) throw new Error("no proposal for manufactured sub");

		const phases = proposal.phases
			.map((phase) => ({
				starts_at: phase.starts_at,
				plans: phase.plans.map((plan) => ({ ...plan, expire_previous: true })),
			}))
			.filter((phase) => phase.plans.length > 0);

		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: stripeSubscription.id,
			phases,
		} satisfies SyncParamsV1);

		const after = await CusService.getFull({ ctx, idOrInternalId: customerId });
		const proCusProduct = after.customer_products.find(
			(cp) => cp.product_id === pro.id && cp.status === "active",
		);
		expect(proCusProduct).toBeDefined();
		const prepaidCusEnt = proCusProduct?.customer_entitlements.find(
			(ce) => ce.entitlement?.feature?.id === MESSAGES,
		);
		expect(prepaidCusEnt?.entitlement?.allowance).toBe(5000);
		expect(prepaidCusEnt?.balance).toBe(5000);
	},
);

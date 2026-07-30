/**
 * Billing Verify: Mismatch Severity
 *
 * Contract under test (billingActions.verify):
 *   New types/fields:
 *     - SubscriptionMismatch.severity: "error" | "warning" — stamped by the
 *       action; "stripe_sub_not_in_autumn" is warning-level, all other
 *       mismatch types default to error.
 *     - "subscription_not_linked" renamed to "stripe_sub_not_in_autumn"
 *       (explicit about WHICH side is missing).
 *   New behaviors:
 *     - An extra Stripe-only sub (no Autumn products linked) -> mismatch
 *       { type: "stripe_sub_not_in_autumn", severity: "warning" }.
 *     - A removed base price item -> base_price_mismatch with
 *       severity: "error".
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { verify } from "@/internal/billing/v2/actions/verify/verify";
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

const firstStripePriceIdFor = async ({
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
		const id =
			price.config.stripe_price_id ?? price.config.stripe_empty_price_id;
		if (id) return id;
	}
	throw new Error(`No Stripe price id on product ${productId}`);
};

test.concurrent(
	`${chalk.yellowBright("billing-verify severity 1: Stripe-only sub -> stripe_sub_not_in_autumn at warning severity")}`,
	async () => {
		const customerId = "verify-severity-extra-sub";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 200 })],
		});
		const addon = products.recurringAddOn({
			id: "addon-stripe-only",
			items: [],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const addonPriceId = await firstStripePriceIdFor({
			ctx,
			productId: addon.id,
		});
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });

		// A second, Stripe-only subscription Autumn knows nothing about.
		const extraSub = await ctx.stripeCli.subscriptions.create({
			customer: stripeCustomerId,
			items: [{ price: addonPriceId, quantity: 1 }],
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		// ── Contract: warning-level stripe_sub_not_in_autumn ──────────────
		const extra = result.subscriptions.find(
			(subscription) => subscription.stripe_subscription_id === extraSub.id,
		);
		expect(extra?.status).toBe("mismatched");
		expect(extra?.mismatches).toMatchObject([
			{ type: "stripe_sub_not_in_autumn", severity: "warning" },
		]);

		// ── Contract: the linked sub stays correct ────────────────────────
		const linked = result.subscriptions.find(
			(subscription) => subscription.stripe_subscription_id !== extraSub.id,
		);
		expect(linked?.status).toBe("correct");
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify severity 2: real drift -> error severity")}`,
	async () => {
		const customerId = "verify-severity-error";

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

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const basePrice = fullProduct.prices.find(
			(price) => !price.config.feature_id,
		);
		const basePriceId =
			basePrice?.config.stripe_price_id ??
			basePrice?.config.stripe_empty_price_id;
		if (!basePriceId) throw new Error("No base Stripe price id on pro");

		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: { removeItemPriceIds: [basePriceId] },
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		// ── Contract: drift mismatches carry error severity ───────────────
		expect(result.subscriptions[0].status).toBe("mismatched");
		expect(result.subscriptions[0].mismatches).toMatchObject([
			{ type: "base_price_mismatch", reason: "missing", severity: "error" },
		]);
	},
);

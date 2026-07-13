/**
 * TDD contract: syncV2 routes patch-style customize through the attach patch
 * path (setupPatchContext), so add_items / remove_items land on the synced
 * cusProduct. Regression for the legacy customizePlanV1ToV0 path, which
 * silently dropped both (only customize.price / customize.items survived).
 *
 * Contract under test (sync a product-matched Stripe sub with customize):
 *   A. remove_items + add_items on the same feature -> included overridden
 *      (the enterprise / csv-quota override shape).
 *   B. add_items with a feature NOT on the plan -> entitlement added,
 *      catalog items untouched.
 *   C. remove_items alone -> entitlement absent from the synced product.
 */
import { expect, test } from "bun:test";
import type { ApiCustomerV3, CustomizePlanV1 } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { createStripeSubscriptionFromProduct } from "./utils/syncTestUtils";

const syncWithCustomize = async ({
	autumnV1,
	customerId,
	planId,
	stripeSubscription,
	customize,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: AutumnInt test client
	autumnV1: any;
	customerId: string;
	planId: string;
	stripeSubscription: Stripe.Subscription;
	customize: CustomizePlanV1;
}) =>
	autumnV1.post("/billing.sync_v2", {
		customer_id: customerId,
		stripe_subscription_id: stripeSubscription.id,
		phases: [{ starts_at: "now", plans: [{ plan_id: planId, customize }] }],
	});

// ── A. remove + re-add the same feature with a new included amount ─────────

test.concurrent(
	`${chalk.yellowBright("sync customize: remove+add overrides included usage")}`,
	async () => {
		const customerId = "sync-customize-override";
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

		const stripeSubscription = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});

		await syncWithCustomize({
			autumnV1,
			customerId,
			planId: pro.id,
			stripeSubscription,
			customize: {
				remove_items: [{ feature_id: TestFeature.Messages }],
				add_items: [
					{
						feature_id: TestFeature.Messages,
						included: 500,
						reset: { interval: ResetInterval.Month },
					},
				],
			},
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: pro.id });
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
	},
);

// ── B. add_items with a feature not on the plan ─────────────────────────────

test.concurrent(
	`${chalk.yellowBright("sync customize: add_items adds a new feature, catalog items untouched")}`,
	async () => {
		const customerId = "sync-customize-add-new";
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

		const stripeSubscription = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});

		await syncWithCustomize({
			autumnV1,
			customerId,
			planId: pro.id,
			stripeSubscription,
			customize: {
				add_items: [
					{
						feature_id: TestFeature.Users,
						included: 3,
						reset: { interval: ResetInterval.Month },
					},
				],
			},
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: pro.id });
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: 3,
			balance: 3,
			usage: 0,
		});
		// Catalog item untouched by the add.
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
	},
);

// ── C. remove_items alone drops the catalog item ────────────────────────────

test.concurrent(
	`${chalk.yellowBright("sync customize: remove_items drops the catalog item")}`,
	async () => {
		const customerId = "sync-customize-remove";
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

		const stripeSubscription = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});

		await syncWithCustomize({
			autumnV1,
			customerId,
			planId: pro.id,
			stripeSubscription,
			customize: {
				remove_items: [{ feature_id: TestFeature.Messages }],
			},
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: pro.id });
		expect(customer.features[TestFeature.Messages]).toBeUndefined();

		await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
	},
);

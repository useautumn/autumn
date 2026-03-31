import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectFeatureCachedAndDb } from "@tests/integration/billing/utils/expectFeatureCachedAndDb";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";

/**
 * Regression test for: billing.update + recalculate_balances returns 200
 * but Autumn dashboard still shows old balance.
 *
 * Root cause (from Axiom, 2026-03-30 22:08–22:09 UTC):
 *
 * billing.update took ~20s. During that window, Stripe webhooks
 * (customer.subscription.updated, invoice.created, invoice.paid) fired and
 * deleted the Redis FullCustomer cache key. Concurrently, balances.check and
 * entities.get calls re-populated the cache with the stale pre-update value.
 * When billing.update finally called updateCachedCustomerProduct, the Lua
 * script found the key present but holding stale data, patched only the
 * cusProduct fields (not the entitlement balances), and returned ok:true.
 * refreshCacheMiddleware then deleted that key. The net result: 200 returned,
 * cache empty, next dashboard poll re-populated from the DB correctly — but
 * any read in the gap between the stale re-population and the middleware
 * delete served the old 250/250 balance.
 *
 * This test replicates the exact concurrent structure 1:1:
 *   - billing.update runs for ~20s
 *   - Concurrently: cache is deleted (webhook), then immediately re-populated
 *     with stale data by a balances.check-equivalent GET
 *   - After 200: assert both cached and DB reads show the new balance
 */

test.concurrent(`${chalk.yellowBright("cache-race: concurrent webhook delete + stale re-population during billing.update leaves correct balance after 200")}`, async () => {
	const customerId = "billing-update-cache-race";
	const initialQuantity = 250;
	const updatedQuantity = 1500;

	const product = products.base({
		id: "ai-credits-plan",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits: 1,
				price: 1,
				includedUsage: 0,
			}),
		],
	});

	const { autumnV1, autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
		],
	});

	// Confirm correct initial state in both cache and DB before the race.
	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		balance: initialQuantity,
		usage: 0,
	});

	await Promise.all([
		// Leg 1: the long-running billing.update (~20s in prod).
		autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: product.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: updatedQuantity },
			],
			recalculate_balances: { enabled: true },
		}),

		// Leg 2: concurrent webhook + stale reader, mirroring the Axiom timeline.
		(async () => {
			// Wait for billing.update to be in-flight (Stripe processes subscription
			// update and fires webhooks roughly 2–3s after the call starts).
			await timeout(3000);

			// Simulate customer.subscription.updated webhook deleting the cache.
			await deleteCachedFullCustomer({
				customerId,
				ctx,
				source: "simulated-stripe-webhook",
				skipGuard: true,
			});

			// Simulate concurrent balances.check / entities.get reads that
			// re-populate the cache with the pre-update stale value while
			// billing.update is still running (this is what Kyle's dashboard
			// was doing — polling GET /customers mid-flight).
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		})(),
	]);

	// THE ASSERTION THAT CATCHES THE BUG:
	// Both reads must reflect the new balance immediately after billing.update
	// returns 200 — not the stale pre-update value re-populated by the concurrent
	// reads during the race window.
	const customerCached =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const customerDb = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});

	console.log(
		`[cache-race] cached balance: ${customerCached.features[TestFeature.Messages]?.balance} | db balance: ${customerDb.features[TestFeature.Messages]?.balance} | expected: ${updatedQuantity}`,
	);

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		balance: updatedQuantity,
		usage: 0,
	});
});

/**
 * Control: same product/quantity update without the concurrent race.
 * Ensures the fix doesn't break the happy path.
 */
test.concurrent(`${chalk.yellowBright("cache-race: billing.update with recalculate_balances reflects new balance in cache (no race)")}`, async () => {
	const customerId = "billing-update-no-cache-race";
	const initialQuantity = 250;
	const updatedQuantity = 1500;

	const product = products.base({
		id: "ai-credits-plan",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits: 1,
				price: 1,
				includedUsage: 0,
			}),
		],
	});

	const { autumnV1, autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
		],
	});

	await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: product.id,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: updatedQuantity },
		],
		recalculate_balances: { enabled: true },
	});

	const customerCached =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const customerDb = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});

	console.log(
		`[no-race] cached balance: ${customerCached.features[TestFeature.Messages]?.balance} | db balance: ${customerDb.features[TestFeature.Messages]?.balance} | expected: ${updatedQuantity}`,
	);

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		balance: updatedQuantity,
		usage: 0,
	});
});

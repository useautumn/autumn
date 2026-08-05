/**
 * TDD test for: a custom `billing.update` 404s with `feature_not_found` when the
 * customer product carries a usage entitlement row owned by a DIFFERENT product
 * than the customer product itself (grandfathered / migrated rows).
 *
 * Reported by mintlify: updating a subscription to $150/mo returned
 * `createStripeInArrearPrice: feature not found for price pr_...` on every retry
 * (a different price id each time, because the id is minted fresh and never
 * persisted). 1890 mintlify customer products are in this shape.
 *
 * Red-failure mode (current behavior):
 *  - `itemToPriceAndEnt` always mints a fresh custom price stamped with the
 *    customer product's own `internal_product_id`, while an unchanged
 *    entitlement is carried over as `sameEnt` and keeps the OTHER product's
 *    `internal_product_id` (`entsAreSame` does not compare it).
 *  - `priceToEnt` matches on `entitlement_id` AND `internal_product_id`, so it
 *    fails to resolve an entitlement that is sitting right there in the array,
 *    and `createStripeInArrearPrice` throws a 404 `feature_not_found`.
 *
 * Green-success criteria (after fix):
 *  - `priceToEnt` resolves by entitlement id alone — ids are globally unique
 *    KSUIDs, and its customer-product-scoped sibling
 *    `customerPriceToCustomerEntitlement` already matches this way — so the
 *    update succeeds and the new base price is applied.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { queryRows } from "@tests/integration/balances/utils/usage-limit-utils/usageWindowDbTestUtils";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { sql } from "drizzle-orm";

/** The customer product's live price/entitlement ids, as the dashboard reads
 * them back before echoing them into `billing.update`. */
const getLiveItemIds = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
}) =>
	queryRows(
		await ctx.db.execute(sql`
			SELECT
				customer_entitlement.entitlement_id,
				entitlement.internal_product_id AS entitlement_internal_product_id,
				customer_product.internal_product_id AS customer_product_internal_product_id,
				price.id AS price_id
			FROM customer_entitlements customer_entitlement
			JOIN customer_products customer_product
				ON customer_product.id = customer_entitlement.customer_product_id
			JOIN customers customer
				ON customer.internal_id = customer_product.internal_customer_id
			JOIN entitlements entitlement
				ON entitlement.id = customer_entitlement.entitlement_id
			LEFT JOIN prices price
				ON price.entitlement_id = entitlement.id
			WHERE customer.id = ${customerId}
				AND customer.org_id = ${ctx.org.id}
				AND customer.env = ${ctx.env}
				AND customer_product.status = 'active'
				AND entitlement.feature_id = ${featureId}
			LIMIT 1
		`),
	)[0];

test.concurrent(
	`${chalk.yellowBright("p2p: custom update when the usage entitlement belongs to another product")}`,
	async () => {
		const customerId = "p2p-cross-version-ent";
		const messagesItem = items.consumableMessages({
			includedUsage: 0,
			price: 0.01,
		});
		const priceItem = items.monthlyPrice({ price: 20 });

		const pro = products.base({
			id: "pro-cross-version",
			items: [messagesItem, priceItem],
		});
		// Stands in for the older plan version the grandfathered entitlement row
		// still belongs to after a migration.
		const legacy = products.base({
			id: "legacy-cross-version",
			items: [items.monthlyWords({ includedUsage: 1 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, legacy] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const before = await getLiveItemIds({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(before?.entitlement_id).toBeTruthy();
		expect(before?.price_id).toBeTruthy();

		// Reproduce the grandfathered pair: the customer product still points at
		// `pro`, but its usage price AND entitlement are both owned by the older
		// plan. They agree with each other — only the customer product has moved
		// on — which is what makes the regenerated custom price straddle them.
		const legacyInternalId = sql`(
			SELECT internal_id FROM products
			WHERE id = ${legacy.id}
				AND org_id = ${ctx.org.id}
				AND env = ${ctx.env}
			LIMIT 1
		)`;
		await ctx.db.execute(sql`
			UPDATE entitlements SET internal_product_id = ${legacyInternalId}
			WHERE id = ${before.entitlement_id}
		`);
		await ctx.db.execute(sql`
			UPDATE prices SET internal_product_id = ${legacyInternalId}
			WHERE id = ${before.price_id}
		`);

		const after = await getLiveItemIds({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(after.entitlement_internal_product_id).not.toBe(
			after.customer_product_internal_product_id,
		);

		// The dashboard echoes the customer product's live item ids back on update.
		// Repricing the usage item (and only it) is what forces `itemToPriceAndEnt`
		// down the `updatedPrice` branch: the entitlement is unchanged so it is
		// carried over as `sameEnt` keeping the older product, while the price is
		// regenerated and stamped with the customer product's product.
		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [
				{
					...items.consumableMessages({ includedUsage: 0, price: 0.02 }),
					entitlement_id: before.entitlement_id,
					price_id: before.price_id,
				},
				items.monthlyPrice({ price: 150 }),
			],
		};

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 0,
			balance: 0,
			usage: 0,
		});
	},
);

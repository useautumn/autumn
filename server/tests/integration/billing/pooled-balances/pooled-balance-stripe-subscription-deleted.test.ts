/** Guards the Stripe-owned deletion path: removing a pooled grant keeps shared usage as debt. */

import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	CusProductStatus,
	customerEntitlements,
	customerProducts,
	pooledBalanceContributions,
	pooledBalances,
} from "@autumn/shared";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/index.js";
import { getEntitySubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { timeout } from "@/utils/genUtils.js";

const POOLED_GRANT = 500;
const CONSUMED_USAGE = 400;

const getSourcePooledState = async ({
	ctx,
	sourceCustomerProductId,
}: {
	ctx: TestContext;
	sourceCustomerProductId: string;
}) => {
	const contribution = await ctx.db.query.pooledBalanceContributions.findFirst({
		where: eq(
			pooledBalanceContributions.source_customer_product_id,
			sourceCustomerProductId,
		),
	});
	if (!contribution) {
		throw new Error("Expected a pooled contribution for the source product");
	}

	const pool = await ctx.db.query.pooledBalances.findFirst({
		where: eq(pooledBalances.id, contribution.pooled_balance_id),
	});
	if (!pool) {
		throw new Error("Expected the contribution's pooled balance");
	}

	const [poolCustomerEntitlement, sourceCustomerProduct] = await Promise.all([
		ctx.db.query.customerEntitlements.findFirst({
			where: eq(customerEntitlements.id, pool.customer_entitlement_id),
		}),
		ctx.db.query.customerProducts.findFirst({
			where: eq(customerProducts.id, sourceCustomerProductId),
		}),
	]);
	if (!poolCustomerEntitlement || !sourceCustomerProduct) {
		throw new Error(
			"Expected the pool entitlement and source customer product",
		);
	}

	return { contribution, pool, poolCustomerEntitlement, sourceCustomerProduct };
};

test.concurrent(
	`${chalk.yellowBright("pooled Stripe webhook: subscription.deleted removes the source and retains shared usage as debt")}`,
	async () => {
		const pooledPlan = products.pro({
			id: "pooled-stripe-subscription-deleted",
			items: [
				{
					...items.monthlyMessages({ includedUsage: POOLED_GRANT }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "pooled-stripe-subscription-deleted",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
				s.track({
					featureId: TestFeature.Messages,
					value: CONSUMED_USAGE,
					entityIndex: 1,
					timeout: 2000,
				}),
			],
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const sourceCustomerProduct = fullCustomer.customer_products.find(
			(customerProduct) =>
				customerProduct.product.id === pooledPlan.id &&
				customerProduct.entity_id === entities[0].id,
		);
		if (!sourceCustomerProduct) {
			throw new Error("Expected an active pooled entity source");
		}

		const beforeCancellation = await getSourcePooledState({
			ctx,
			sourceCustomerProductId: sourceCustomerProduct.id,
		});
		expect(beforeCancellation.contribution).toMatchObject({
			current_contribution: POOLED_GRANT,
			next_cycle_contribution: POOLED_GRANT,
		});
		expect(beforeCancellation.poolCustomerEntitlement).toMatchObject({
			adjustment: POOLED_GRANT,
			balance: POOLED_GRANT - CONSUMED_USAGE,
		});

		const stripeSubscriptionId = await getEntitySubscriptionId({
			ctx,
			customerId,
			entityId: entities[0].id,
			productId: pooledPlan.id,
		});
		await ctx.stripeCli.subscriptions.cancel(stripeSubscriptionId);
		await timeout(12_000);

		const afterCancellation = await getSourcePooledState({
			ctx,
			sourceCustomerProductId: sourceCustomerProduct.id,
		});
		expect(afterCancellation.pool.id).toEqual(beforeCancellation.pool.id);
		expect(afterCancellation.contribution).toMatchObject({
			current_contribution: 0,
			next_cycle_contribution: 0,
		});
		expect(afterCancellation.poolCustomerEntitlement).toMatchObject({
			adjustment: 0,
			balance: -CONSUMED_USAGE,
		});
		expect(afterCancellation.sourceCustomerProduct).toMatchObject({
			status: CusProductStatus.Expired,
		});

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.allowed).toEqual(false);
		expect(check.balance).toMatchObject({
			granted: 0,
			remaining: 0,
			usage: CONSUMED_USAGE,
		});
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
	90_000,
);

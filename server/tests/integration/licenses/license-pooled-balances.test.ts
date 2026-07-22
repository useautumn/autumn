import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	customerEntitlements,
	customerProducts,
	customers,
	ErrCode,
	fullCustomerToCustomerEntitlements,
	OnDecrease,
	OnIncrease,
	pooledBalanceContributions,
	pooledBalances,
	type SyncParamsV1,
	type TrackResponseV3,
} from "@autumn/shared";
import { setEntityUsageLimit } from "@tests/integration/balances/utils/usage-limit-utils/entityUsageLimitUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type Stripe from "stripe";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription.js";
import { handleStripeInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/handleStripeInvoiceCreated.js";
import { isStripeSubscriptionCanceledEvent } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/handleStripeSubscriptionCanceled/isStripeSubscriptionCanceledEvent.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";

const attachLicenseToEntity = async ({
	autumn,
	ctx,
	customerId,
	entity,
	licensePlanId,
}: {
	autumn: AutumnInt;
	ctx: Parameters<typeof CusService.getFull>[0]["ctx"];
	customerId: string;
	entity: { id: string };
	licensePlanId: string;
}) => {
	await autumn.post("/licenses.attach", {
		customer_id: customerId,
		plan_id: licensePlanId,
		entities: [{ entity_id: entity.id }],
	});
	const assignment = (
		await ctx.db.query.customerProducts.findMany({
			where: eq(customerProducts.entity_id, entity.id),
			with: { product: true },
		})
	).find(
		(customerProduct) =>
			customerProduct.product.id === licensePlanId &&
			customerProduct.customer_license_link_id !== null &&
			(customerProduct.status === "active" ||
				customerProduct.status === "past_due"),
	);
	if (!assignment) {
		throw new Error(
			`Expected license '${licensePlanId}' assignment for entity '${entity.id}'`,
		);
	}
	return { assignment: { id: assignment.id } };
};

test("Stripe period-end cancellation derives its boundary from subscription items", () => {
	const canceledAtSeconds = 1_700_000_000;
	const earlierPeriodEndSeconds = 1_800_000_000;
	const laterPeriodEndSeconds = 1_900_000_000;

	const cancellation = isStripeSubscriptionCanceledEvent({
		stripeSubscription: {
			cancel_at: null,
			cancel_at_period_end: true,
			canceled_at: canceledAtSeconds,
			items: {
				data: [
					{ current_period_end: laterPeriodEndSeconds },
					{ current_period_end: earlierPeriodEndSeconds },
				],
			},
		} as unknown as ExpandedStripeSubscription,
		previousAttributes: { cancel_at_period_end: false },
	});

	expect(cancellation).toEqual({
		canceled: true,
		canceledAtMs: canceledAtSeconds * 1000,
		cancelsAtMs: earlierPeriodEndSeconds * 1000,
	});
});

test.concurrent(
	`${chalk.yellowBright("licenses pooled: compatible assignments share one customer balance")}`,
	async () => {
		const parent = products.base({
			id: "pooled-license-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "pooled-license-seat",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "license-pooled-shared-balance",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 3, featureId: TestFeature.Users }),
					s.products({ list: [parent, license] }),
				],
				actions: [
					s.licenses.link({
						parentProductId: parent.id,
						licenseProductId: license.id,
						included: 2,
					}),
					s.billing.attach({ productId: parent.id }),
				],
			});

		const [firstAttach] = await Promise.all([
			attachLicenseToEntity({
				autumn: autumnV2_2,
				ctx,
				customerId,
				entity: entities[0],
				licensePlanId: license.id,
			}),
			attachLicenseToEntity({
				autumn: autumnV2_2,
				ctx,
				customerId,
				entity: entities[1],
				licensePlanId: license.id,
			}),
		]);
		const duplicateAttach = await attachLicenseToEntity({
			autumn: autumnV2_2,
			ctx,
			customerId,
			entity: entities[0],
			licensePlanId: license.id,
		});

		expect(duplicateAttach.assignment.id).toBe(firstAttach.assignment.id);

		const internalCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		if (!internalCustomer) {
			throw new Error(`Customer '${customerId}' not found`);
		}

		const materializedPools = await ctx.db.query.customerEntitlements.findMany({
			where: and(
				eq(
					customerEntitlements.internal_customer_id,
					internalCustomer.internal_id,
				),
				isNull(customerEntitlements.customer_product_id),
			),
		});
		expect(materializedPools).toHaveLength(1);
		expect(materializedPools[0]).toMatchObject({
			balance: 1000,
			adjustment: 1000,
			internal_entity_id: null,
		});

		const firstSourceCustomerEntitlements =
			await ctx.db.query.customerEntitlements.findMany({
				where: eq(
					customerEntitlements.customer_product_id,
					firstAttach.assignment.id,
				),
				with: { entitlement: true },
			});
		expect(firstSourceCustomerEntitlements).toHaveLength(1);
		expect(firstSourceCustomerEntitlements[0]).toMatchObject({
			balance: 0,
			adjustment: 0,
			internal_entity_id: null,
			entitlement: { pooled: true },
		});

		const initialChecks = await Promise.all(
			entities.map((entity) =>
				autumnV2_2.check<CheckResponseV3>({
					customer_id: customerId,
					entity_id: entity.id,
					feature_id: TestFeature.Messages,
				}),
			),
		);
		for (const check of initialChecks) {
			expect(check.allowed).toBe(true);
			expect(check.balance).toMatchObject({
				granted: 1000,
				remaining: 1000,
				usage: 0,
			});
			expect(check.balance?.breakdown).toHaveLength(1);
			expect(check.balance?.breakdown?.[0]?.plan_id).toBeNull();
		}

		const firstTrack = (await autumnV2_2.track(
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				value: 300,
				overage_behavior: "reject",
			},
			{ timeout: 2000 },
		)) as TrackResponseV3;
		expect(firstTrack.balance).toMatchObject({
			granted: 1000,
			remaining: 700,
			usage: 300,
		});

		const unassignedEntityCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
		});
		expect(unassignedEntityCheck.balance).toMatchObject({
			granted: 1000,
			remaining: 700,
			usage: 300,
		});

		const secondTrack = (await autumnV2_2.track(
			{
				customer_id: customerId,
				entity_id: entities[2].id,
				feature_id: TestFeature.Messages,
				value: 700,
				overage_behavior: "reject",
			},
			{ timeout: 2000 },
		)) as TrackResponseV3;
		expect(secondTrack.balance).toMatchObject({
			granted: 1000,
			remaining: 0,
			usage: 1000,
		});

		const exhaustedCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
		});
		expect(exhaustedCheck.allowed).toBe(false);
		expect(exhaustedCheck.balance).toMatchObject({
			granted: 1000,
			remaining: 0,
			usage: 1000,
		});

		await autumnV2_2.post("/licenses.release", {
			customer_id: customerId,
			entity_ids: [entities[0].id],
			license_plan_id: license.id,
		});

		const poolAfterRemoval = await ctx.db.query.customerEntitlements.findFirst({
			where: eq(customerEntitlements.id, materializedPools[0].id),
		});
		expect(poolAfterRemoval).toMatchObject({
			balance: -500,
			adjustment: 500,
		});

		const removedContribution =
			await ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					firstAttach.assignment.id,
				),
			});
		expect(removedContribution).toMatchObject({
			source_customer_product_id: firstAttach.assignment.id,
			current_contribution: 0,
			next_cycle_contribution: 0,
		});

		const otherEntityAfterRemoval = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
		});
		expect(otherEntityAfterRemoval.allowed).toBe(false);
		expect(otherEntityAfterRemoval.balance).toMatchObject({
			granted: 500,
			remaining: 0,
			usage: 1000,
		});

		const resetAt = Date.now() - 1_000;
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: resetAt,
		});

		const checkAfterReset = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
		});
		expect(checkAfterReset.allowed).toBe(true);
		expect(checkAfterReset.balance).toMatchObject({
			granted: 500,
			remaining: 500,
			usage: 0,
		});

		const poolAfterReset = await ctx.db.query.customerEntitlements.findFirst({
			where: eq(customerEntitlements.id, materializedPools[0].id),
		});
		expect(poolAfterReset).toMatchObject({
			balance: 500,
			adjustment: 500,
		});
		expect(poolAfterReset?.next_reset_at).toBeGreaterThan(resetAt);

		const poolState = await ctx.db.query.pooledBalances.findFirst({
			where: eq(
				pooledBalances.customer_entitlement_id,
				materializedPools[0].id,
			),
		});
		expect(poolState?.last_applied_reset_at).toBe(resetAt);

		await autumnV1.entities.delete(customerId, entities[1].id);
		const poolAfterEntityDeletion =
			await ctx.db.query.customerEntitlements.findFirst({
				where: eq(customerEntitlements.id, materializedPools[0].id),
			});
		expect(poolAfterEntityDeletion).toMatchObject({
			balance: 0,
			adjustment: 0,
		});
	},
	60_000,
);

/**
 * TDD regression for removing a contribution after usage was deducted from one
 * of several same-feature pools.
 *
 * Red-failure mode (current behavior):
 * - The removed pool stays negative while its compatible sibling stays
 *   positive, so the API reports inflated remaining and separate overage.
 *
 * Green-success criteria:
 * - Usage is reapplied across the surviving grants with Autumn's existing
 *   deduction order, leaving only true residual overage.
 */
test.concurrent(
	`${chalk.yellowBright("licenses pooled: source removal rebalances usage across separate balances")}`,
	async () => {
		const firstParent = products.base({
			id: "pooled-anchor-parent-a",
			isAddOn: true,
			items: [items.dashboard()],
		});
		const secondParent = products.base({
			id: "pooled-anchor-parent-b",
			isAddOn: true,
			items: [items.dashboard()],
		});
		const firstLicense = products.base({
			id: "pooled-anchor-license-a",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});
		const secondLicense = products.base({
			id: "pooled-anchor-license-b",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "license-pooled-separated-balances-rebalance",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({
					list: [firstParent, secondParent, firstLicense, secondLicense],
				}),
			],
			actions: [
				s.licenses.link({
					parentProductId: firstParent.id,
					licenseProductId: firstLicense.id,
					included: 1,
				}),
				s.licenses.link({
					parentProductId: secondParent.id,
					licenseProductId: secondLicense.id,
					included: 1,
				}),
				s.billing.attach({ productId: firstParent.id }),
				s.billing.attach({ productId: secondParent.id }),
			],
		});

		const internalCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		if (!internalCustomer) {
			throw new Error(`Customer '${customerId}' not found`);
		}

		const parentCustomerProducts = await ctx.db.query.customerProducts.findMany(
			{
				where: eq(
					customerProducts.internal_customer_id,
					internalCustomer.internal_id,
				),
				with: { product: true },
			},
		);
		const firstParentCustomerProduct = parentCustomerProducts.find(
			(customerProduct) => customerProduct.product.id === firstParent.id,
		);
		const secondParentCustomerProduct = parentCustomerProducts.find(
			(customerProduct) => customerProduct.product.id === secondParent.id,
		);
		if (!firstParentCustomerProduct || !secondParentCustomerProduct) {
			throw new Error("Expected both pooled license parents");
		}

		const firstAnchor = Date.now() - 10_000;
		const secondAnchor = firstAnchor - 86_400_000;
		await Promise.all([
			ctx.db
				.update(customerProducts)
				.set({ starts_at: firstAnchor })
				.where(eq(customerProducts.id, firstParentCustomerProduct.id)),
			ctx.db
				.update(customerProducts)
				.set({ starts_at: secondAnchor })
				.where(eq(customerProducts.id, secondParentCustomerProduct.id)),
		]);
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "pooled-anchor-test",
		});

		const [firstAssignment, secondAssignment] = await Promise.all([
			attachLicenseToEntity({
				autumn: autumnV2_2,
				ctx,
				customerId,
				entity: entities[0],
				licensePlanId: firstLicense.id,
			}),
			attachLicenseToEntity({
				autumn: autumnV2_2,
				ctx,
				customerId,
				entity: entities[1],
				licensePlanId: secondLicense.id,
			}),
		]);

		const pools = await ctx.db.query.pooledBalances.findMany({
			where: eq(
				pooledBalances.internal_customer_id,
				internalCustomer.internal_id,
			),
		});
		expect(pools).toHaveLength(2);
		expect(pools.map((pool) => pool.reset_cycle_anchor).sort()).toEqual([
			secondAnchor,
			firstAnchor,
		]);

		const unassignedEntityCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
		});
		expect(unassignedEntityCheck.balance).toMatchObject({
			granted: 1000,
			remaining: 1000,
			usage: 0,
		});
		expect(unassignedEntityCheck.balance?.breakdown).toHaveLength(2);

		await autumnV2_2.track(
			{
				customer_id: customerId,
				entity_id: entities[2].id,
				feature_id: TestFeature.Messages,
				value: 300,
				overage_behavior: "reject",
			},
			{ timeout: 2000 },
		);

		const poolCustomerEntitlementsAfterTrack =
			await ctx.db.query.customerEntitlements.findMany({
				where: inArray(
					customerEntitlements.id,
					pools.map((pool) => pool.customer_entitlement_id),
				),
			});
		const consumedPoolCustomerEntitlement =
			poolCustomerEntitlementsAfterTrack.find(
				(customerEntitlement) => customerEntitlement.balance === 200,
			);
		if (!consumedPoolCustomerEntitlement) {
			throw new Error(
				"Expected one pooled balance to contain the tracked usage",
			);
		}
		const consumedPool = pools.find(
			(pool) =>
				pool.customer_entitlement_id === consumedPoolCustomerEntitlement.id,
		);
		if (!consumedPool) {
			throw new Error("Expected the consumed pooled balance record");
		}
		const consumedContribution =
			await ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(
					pooledBalanceContributions.pooled_balance_id,
					consumedPool.id,
				),
			});
		if (!consumedContribution) {
			throw new Error("Expected the consumed pooled contribution");
		}
		const assignmentToRemove = [
			{
				...firstAssignment,
				entityId: entities[0].id,
				licensePlanId: firstLicense.id,
			},
			{
				...secondAssignment,
				entityId: entities[1].id,
				licensePlanId: secondLicense.id,
			},
		].find(
			({ assignment }) =>
				assignment.id === consumedContribution.source_customer_product_id,
		);
		if (!assignmentToRemove) {
			throw new Error("Expected the consumed pool to belong to an assignment");
		}

		await autumnV2_2.post("/licenses.release", {
			customer_id: customerId,
			entity_ids: [assignmentToRemove.entityId],
			license_plan_id: assignmentToRemove.licensePlanId,
		});

		const checkAfterRemoval = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
		});
		expect(checkAfterRemoval.balance).toMatchObject({
			granted: 500,
			remaining: 200,
			usage: 300,
		});
		expect(
			checkAfterRemoval.balance?.breakdown?.every(
				(breakdown) => (breakdown.overage ?? 0) === 0,
			),
		).toBe(true);

		const poolCustomerEntitlementsAfterRemoval =
			await ctx.db.query.customerEntitlements.findMany({
				where: inArray(
					customerEntitlements.id,
					pools.map((pool) => pool.customer_entitlement_id),
				),
			});
		expect(
			poolCustomerEntitlementsAfterRemoval
				.map((customerEntitlement) => ({
					adjustment: customerEntitlement.adjustment,
					balance: customerEntitlement.balance,
				}))
				.sort((first, second) => first.balance - second.balance),
		).toEqual([
			{ adjustment: 0, balance: 0 },
			{ adjustment: 500, balance: 200 },
		]);
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("licenses pooled: cancelling a parent withdraws stranded assignment contributions")}`,
	async () => {
		const parent = products.base({
			id: "pooled-parent-cancel-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "pooled-parent-cancel-license",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "license-pooled-parent-cancel",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});
		const { assignment } = await attachLicenseToEntity({
			autumn: autumnV2_2,
			ctx,
			customerId,
			entity: entities[0],
			licensePlanId: license.id,
		});

		const contributionBeforeCancel =
			await ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					assignment.id,
				),
			});
		expect(contributionBeforeCancel).toMatchObject({
			current_contribution: 500,
			next_cycle_contribution: 500,
		});
		if (!contributionBeforeCancel) {
			throw new Error(
				"Expected pooled contribution before parent cancellation",
			);
		}
		const poolBeforeCancel = await ctx.db.query.pooledBalances.findFirst({
			where: eq(pooledBalances.id, contributionBeforeCancel.pooled_balance_id),
		});
		if (!poolBeforeCancel) {
			throw new Error("Expected pooled balance before parent cancellation");
		}

		await autumnV2_2.billing.update({
			customer_id: customerId,
			plan_id: parent.id,
			cancel_action: "cancel_immediately",
		});

		const contributionAfterCancel =
			await ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					assignment.id,
				),
			});
		expect(contributionAfterCancel).toMatchObject({
			current_contribution: 0,
			next_cycle_contribution: 0,
		});

		const poolAfterCancel = await ctx.db.query.customerEntitlements.findFirst({
			where: eq(
				customerEntitlements.id,
				poolBeforeCancel.customer_entitlement_id,
			),
		});
		expect(poolAfterCancel).toMatchObject({
			balance: 0,
			adjustment: 0,
		});

		const checkAfterCancel = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(checkAfterCancel.allowed).toBe(false);
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("licenses pooled: end-of-cycle parent cancellation stages and uncancel restores the next contribution")}`,
	async () => {
		const parent = products.pro({
			id: "pooled-parent-scheduled-cancel-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "pooled-parent-scheduled-cancel-license",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "license-pooled-parent-scheduled-cancel",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
			],
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
		});
		const { assignment } = await attachLicenseToEntity({
			autumn: autumnV2_2,
			ctx,
			customerId,
			entity: entities[0],
			licensePlanId: license.id,
		});

		await autumnV2_2.subscriptions.update({
			customer_id: customerId,
			plan_id: parent.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const scheduledContribution =
			await ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					assignment.id,
				),
			});
		const scheduledEffectiveAt = scheduledContribution?.effective_at;
		expect(scheduledContribution).toMatchObject({
			current_contribution: 500,
			next_cycle_contribution: 0,
		});
		if (!Number.isFinite(scheduledEffectiveAt)) {
			throw new Error(
				`Expected a finite effective boundary, received '${String(scheduledEffectiveAt)}' (${typeof scheduledEffectiveAt})`,
			);
		}
		expect(scheduledEffectiveAt).toBeGreaterThan(Date.now());

		await autumnV2_2.subscriptions.update({
			customer_id: customerId,
			plan_id: parent.id,
			cancel_action: "uncancel",
		});

		const restoredContribution =
			await ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					assignment.id,
				),
			});
		expect(restoredContribution).toMatchObject({
			current_contribution: 500,
			next_cycle_contribution: 500,
			effective_at: null,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("licenses pooled: parent upgrade reassigns the contribution owner and preserves usage")}`,
	async () => {
		const firstParent = products.pro({
			id: "pooled-reparent-first-parent",
			items: [items.dashboard()],
		});
		const successorParent = products.premium({
			id: "pooled-reparent-successor-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "pooled-reparent-license",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "license-pooled-reparent",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [firstParent, successorParent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: firstParent.id,
					licenseProductId: license.id,
					included: 1,
				}),
				s.licenses.link({
					parentProductId: successorParent.id,
					licenseProductId: license.id,
					included: 1,
				}),
			],
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: firstParent.id,
		});
		const { assignment } = await attachLicenseToEntity({
			autumn: autumnV2_2,
			ctx,
			customerId,
			entity: entities[0],
			licensePlanId: license.id,
		});

		const contributionBeforeUpgrade =
			await ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					assignment.id,
				),
			});
		if (!contributionBeforeUpgrade) {
			throw new Error("Expected pooled contribution before parent upgrade");
		}
		const oldPool = await ctx.db.query.pooledBalances.findFirst({
			where: eq(pooledBalances.id, contributionBeforeUpgrade.pooled_balance_id),
		});
		if (!oldPool) throw new Error("Expected old pooled balance before upgrade");

		await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 200,
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: successorParent.id,
		});

		const internalCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		if (!internalCustomer) throw new Error("Expected customer after upgrade");
		const customerProductsAfterUpgrade =
			await ctx.db.query.customerProducts.findMany({
				where: eq(
					customerProducts.internal_customer_id,
					internalCustomer.internal_id,
				),
				with: { product: true },
			});
		const successorCustomerProduct = customerProductsAfterUpgrade.find(
			(customerProduct) =>
				customerProduct.product.id === successorParent.id &&
				customerProduct.status === "active",
		);
		if (!successorCustomerProduct) {
			throw new Error("Expected successor customer product after upgrade");
		}

		const contributionAfterUpgrade =
			await ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					assignment.id,
				),
			});
		expect(contributionAfterUpgrade).toMatchObject({
			pooled_balance_id: oldPool.id,
			reset_owner_id: successorCustomerProduct.id,
		});
		const oldPoolBalance = await ctx.db.query.customerEntitlements.findFirst({
			where: eq(customerEntitlements.id, oldPool.customer_entitlement_id),
		});
		expect(oldPoolBalance).toMatchObject({
			balance: 300,
			adjustment: 500,
		});

		const checkAfterUpgrade = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(checkAfterUpgrade.balance).toMatchObject({
			granted: 500,
			remaining: 300,
			usage: 200,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled items: ordinary free entity attachments share one customer balance")}`,
	async () => {
		const pooledPlan = products.base({
			id: "ordinary-free-pooled-plan",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "ordinary-free-pooled-balance",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 3, featureId: TestFeature.Users }),
					s.products({ list: [pooledPlan] }),
				],
				actions: [],
			});

		await Promise.all(
			entities.slice(0, 2).map((entity) =>
				autumnV2_2.billing.attach({
					customer_id: customerId,
					entity_id: entity.id,
					plan_id: pooledPlan.id,
				}),
			),
		);

		const internalCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		if (!internalCustomer) {
			throw new Error(`Customer '${customerId}' not found`);
		}

		const [pools, contributions, sourceCustomerProducts] = await Promise.all([
			ctx.db.query.pooledBalances.findMany({
				where: eq(
					pooledBalances.internal_customer_id,
					internalCustomer.internal_id,
				),
			}),
			ctx.db.query.pooledBalanceContributions.findMany(),
			ctx.db.query.customerProducts.findMany({
				where: eq(
					customerProducts.internal_customer_id,
					internalCustomer.internal_id,
				),
				with: { customer_entitlements: { with: { entitlement: true } } },
			}),
		]);
		const sourceCustomerProductIds = new Set(
			sourceCustomerProducts.map((customerProduct) => customerProduct.id),
		);
		const sourceContributions = contributions.filter((contribution) =>
			sourceCustomerProductIds.has(contribution.source_customer_product_id),
		);

		expect(pools).toHaveLength(1);
		expect(sourceCustomerProducts).toHaveLength(2);
		expect(sourceContributions).toHaveLength(2);
		for (const sourceCustomerProduct of sourceCustomerProducts) {
			expect(sourceCustomerProduct.customer_entitlements).toHaveLength(1);
			expect(sourceCustomerProduct.customer_entitlements[0]).toMatchObject({
				balance: 0,
				adjustment: 0,
				entitlement: { pooled: true },
			});
		}

		const materializedPool = await ctx.db.query.customerEntitlements.findFirst({
			where: eq(
				customerEntitlements.id,
				pools[0]?.customer_entitlement_id ?? "missing",
			),
		});
		expect(materializedPool).toMatchObject({
			balance: 1000,
			adjustment: 1000,
			internal_entity_id: null,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const fullEntity = fullCustomer.entities.find(
			(entity) => entity.id === entities[0].id,
		);
		if (!fullEntity) throw new Error("Expected pooled entity");
		const legacyCustomerEntitlements = fullCustomerToCustomerEntitlements({
			fullCustomer,
			entity: fullEntity,
			featureId: TestFeature.Messages,
		});
		expect(legacyCustomerEntitlements).toHaveLength(1);
		expect(legacyCustomerEntitlements[0]).toMatchObject({
			id: pools[0]?.customer_entitlement_id,
			customer_product: null,
			balance: 1000,
			adjustment: 1000,
		});

		const initialChecks = await Promise.all(
			entities.map((entity) =>
				autumnV2_2.check<CheckResponseV3>({
					customer_id: customerId,
					entity_id: entity.id,
					feature_id: TestFeature.Messages,
				}),
			),
		);
		for (const check of initialChecks) {
			expect(check.allowed).toBe(true);
			expect(check.balance).toMatchObject({
				granted: 1000,
				remaining: 1000,
				usage: 0,
			});
		}

		const track = (await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 300,
		})) as TrackResponseV3;
		expect(track.balance).toMatchObject({
			granted: 1000,
			remaining: 700,
			usage: 300,
		});

		const otherEntityCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
		});
		expect(otherEntityCheck.balance).toMatchObject({
			granted: 1000,
			remaining: 700,
			usage: 300,
		});

		await autumnV2_2.billing.update({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: pooledPlan.id,
			cancel_action: "cancel_immediately",
		});

		const poolAfterCancellation =
			await ctx.db.query.customerEntitlements.findFirst({
				where: eq(
					customerEntitlements.id,
					pools[0]?.customer_entitlement_id ?? "missing",
				),
			});
		expect(poolAfterCancellation).toMatchObject({
			balance: 200,
			adjustment: 500,
		});

		const contributionsAfterCancellation =
			await ctx.db.query.pooledBalanceContributions.findMany({
				where: eq(
					pooledBalanceContributions.pooled_balance_id,
					pools[0]?.id ?? "missing",
				),
			});
		expect(
			contributionsAfterCancellation
				.map((contribution) => contribution.current_contribution)
				.sort((first, second) => first - second),
		).toEqual([0, 500]);

		const checkAfterCancellation = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
		});
		expect(checkAfterCancellation.balance).toMatchObject({
			granted: 500,
			remaining: 200,
			usage: 300,
		});

		await autumnV1.entities.delete(customerId, entities[1].id);

		const poolAfterEntityDeletion =
			await ctx.db.query.customerEntitlements.findFirst({
				where: eq(
					customerEntitlements.id,
					pools[0]?.customer_entitlement_id ?? "missing",
				),
			});
		expect(poolAfterEntityDeletion).toMatchObject({
			balance: -300,
			adjustment: 0,
		});

		const contributionsAfterEntityDeletion =
			await ctx.db.query.pooledBalanceContributions.findMany({
				where: eq(
					pooledBalanceContributions.pooled_balance_id,
					pools[0]?.id ?? "missing",
				),
			});
		expect(
			contributionsAfterEntityDeletion.map(
				(contribution) => contribution.current_contribution,
			),
		).toEqual([0, 0]);
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled items: a customer-level pooled item remains an ordinary balance")}`,
	async () => {
		const pooledPlan = products.base({
			id: "customer-level-pooled-plan",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});
		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "customer-level-pooled-balance",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: pooledPlan.id,
		});
		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(check.balance).toMatchObject({
			granted: 500,
			remaining: 500,
			usage: 0,
		});

		const internalCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		if (!internalCustomer) throw new Error("Expected customer-level customer");
		const [pools, sourceCustomerProduct] = await Promise.all([
			ctx.db.query.pooledBalances.findMany({
				where: eq(
					pooledBalances.internal_customer_id,
					internalCustomer.internal_id,
				),
			}),
			ctx.db.query.customerProducts.findFirst({
				where: eq(
					customerProducts.internal_customer_id,
					internalCustomer.internal_id,
				),
				with: { customer_entitlements: { with: { entitlement: true } } },
			}),
		]);
		expect(pools).toHaveLength(0);
		expect(sourceCustomerProduct).toMatchObject({
			internal_entity_id: null,
			customer_entitlements: [
				{
					balance: 500,
					adjustment: 0,
					entitlement: { pooled: true },
				},
			],
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled items: sync replacement preserves shared usage and replaces its source")}`,
	async () => {
		const pooledPlan = products.pro({
			id: "pooled-sync-replacement",
			items: [
				{
					...items.prepaidMessages({
						includedUsage: 0,
						billingUnits: 100,
						price: 10,
					}),
					pooled: true,
				},
			],
		});
		const { customerId, entities, autumnV1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "pooled-sync-replacement",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
					s.products({ list: [pooledPlan] }),
				],
				actions: [],
			});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: pooledPlan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 300 }],
		});
		await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 100,
		});

		const originalCustomerProduct =
			await ctx.db.query.customerProducts.findFirst({
				where: and(
					eq(customerProducts.customer_id, customerId),
					eq(customerProducts.entity_id, entities[0].id),
				),
			});
		const stripeSubscriptionId = originalCustomerProduct?.subscription_ids?.[0];
		if (!originalCustomerProduct || !stripeSubscriptionId) {
			throw new Error("Expected pooled sync source and Stripe subscription");
		}

		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: stripeSubscriptionId,
			phases: [
				{
					starts_at: "now",
					plans: [
						{
							plan_id: pooledPlan.id,
							entity_id: entities[0].id,
							expire_previous: true,
							feature_quantities: [
								{
									feature_id: TestFeature.Messages,
									quantity: 200,
								},
							],
						},
					],
				},
			],
		} satisfies SyncParamsV1);

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(check.balance).toMatchObject({
			granted: 200,
			remaining: 100,
			usage: 100,
		});

		const internalCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		if (!internalCustomer) throw new Error("Expected synced customer");
		const [activeSource, contributions] = await Promise.all([
			ctx.db.query.customerProducts.findFirst({
				where: and(
					eq(
						customerProducts.internal_customer_id,
						internalCustomer.internal_id,
					),
					eq(customerProducts.status, "active"),
				),
				with: { customer_entitlements: true },
			}),
			ctx.db.query.pooledBalanceContributions.findMany({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					originalCustomerProduct.id,
				),
			}),
		]);
		expect(activeSource?.customer_entitlements[0]).toMatchObject({
			balance: 0,
			adjustment: 0,
		});
		expect(contributions).toHaveLength(1);
		expect(contributions[0]).toMatchObject({
			current_contribution: 0,
			next_cycle_contribution: 0,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled items: an ordinary free replacement applies only the contribution delta")}`,
	async () => {
		const firstPlan = products.base({
			id: "ordinary-free-pooled-first",
			group: "ordinary-free-pooled-upgrade",
			items: [
				{
					...items.monthlyMessages({
						includedUsage: 500,
						resetUsageWhenEnabled: false,
					}),
					pooled: true,
				},
			],
		});
		const successorPlan = products.base({
			id: "ordinary-free-pooled-successor",
			group: "ordinary-free-pooled-upgrade",
			items: [
				{
					...items.monthlyMessages({
						includedUsage: 800,
						resetUsageWhenEnabled: false,
					}),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "ordinary-free-pooled-replacement",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [firstPlan, successorPlan] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: firstPlan.id,
		});
		await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 200,
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: successorPlan.id,
		});

		const internalCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		if (!internalCustomer) {
			throw new Error(`Customer '${customerId}' not found`);
		}
		const pools = await ctx.db.query.pooledBalances.findMany({
			where: eq(
				pooledBalances.internal_customer_id,
				internalCustomer.internal_id,
			),
		});
		expect(pools).toHaveLength(1);

		const [materializedPool, contributions] = await Promise.all([
			ctx.db.query.customerEntitlements.findFirst({
				where: eq(
					customerEntitlements.id,
					pools[0]?.customer_entitlement_id ?? "missing",
				),
			}),
			ctx.db.query.pooledBalanceContributions.findMany({
				where: eq(
					pooledBalanceContributions.pooled_balance_id,
					pools[0]?.id ?? "missing",
				),
			}),
		]);
		expect(materializedPool).toMatchObject({
			balance: 600,
			adjustment: 800,
		});
		expect(
			contributions
				.map((contribution) => contribution.current_contribution)
				.sort((first, second) => first - second),
		).toEqual([0, 800]);

		const checkAfterReplacement = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(checkAfterReplacement.balance).toMatchObject({
			granted: 800,
			remaining: 600,
			usage: 200,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled items: subscription end-of-cycle cancellation stages one source and uncancel restores it")}`,
	async () => {
		const pooledPlan = products.pro({
			id: "ordinary-subscription-pooled-scheduled-cancel",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "ordinary-subscription-pooled-scheduled-cancel",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: pooledPlan.id,
		});

		const sourceCustomerProduct = await ctx.db.query.customerProducts.findFirst(
			{
				where: and(
					eq(customerProducts.customer_id, customerId),
					eq(customerProducts.entity_id, entities[0].id),
				),
			},
		);
		if (!sourceCustomerProduct) {
			throw new Error("Expected ordinary pooled source customer product");
		}

		await autumnV2_2.billing.update({
			customer_id: customerId,
			customer_product_id: sourceCustomerProduct.id,
			entity_id: entities[0].id,
			cancel_action: "cancel_end_of_cycle",
		});

		const stagedContribution =
			await ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					sourceCustomerProduct.id,
				),
			});
		const stagedEffectiveAt = stagedContribution?.effective_at;
		expect(stagedContribution).toMatchObject({
			current_contribution: 500,
			next_cycle_contribution: 0,
		});
		if (!Number.isFinite(stagedEffectiveAt)) {
			throw new Error("Expected a finite pooled source cancellation boundary");
		}

		await autumnV2_2.billing.update({
			customer_id: customerId,
			customer_product_id: sourceCustomerProduct.id,
			entity_id: entities[0].id,
			cancel_action: "uncancel",
		});

		const restoredContribution =
			await ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					sourceCustomerProduct.id,
				),
			});
		expect(restoredContribution).toMatchObject({
			current_contribution: 500,
			next_cycle_contribution: 500,
			effective_at: null,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled items: recurring prepaid quantity materializes as a priced contribution")}`,
	async () => {
		const pooledPrepaidItem = {
			...items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
				price: 10,
				config: {
					on_increase: OnIncrease.ProrateImmediately,
					on_decrease: OnDecrease.None,
				},
			}),
			pooled: true,
		};
		const pooledPlan = products.pro({
			id: "ordinary-subscription-pooled-prepaid",
			items: [pooledPrepaidItem],
		});

		const { customerId, entities, autumnV2_2, ctx, testClockId } =
			await initScenario({
				customerId: "ordinary-subscription-pooled-prepaid",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
					s.products({ list: [pooledPlan] }),
				],
				actions: [],
			});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: pooledPlan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 300 }],
		});

		const internalCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		if (!internalCustomer) {
			throw new Error(`Customer '${customerId}' not found`);
		}
		const pool = await ctx.db.query.pooledBalances.findFirst({
			where: eq(
				pooledBalances.internal_customer_id,
				internalCustomer.internal_id,
			),
		});
		expect(pool?.price_id).not.toBeNull();

		const materializedPool = await ctx.db.query.customerEntitlements.findFirst({
			where: eq(
				customerEntitlements.id,
				pool?.customer_entitlement_id ?? "missing",
			),
		});
		expect(materializedPool).toMatchObject({
			balance: 300,
			adjustment: 300,
		});

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(check.balance).toMatchObject({
			granted: 300,
			remaining: 300,
			usage: 0,
		});

		await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 100,
		});
		const sourceCustomerProduct = await ctx.db.query.customerProducts.findFirst(
			{
				where: and(
					eq(customerProducts.customer_id, customerId),
					eq(customerProducts.entity_id, entities[0].id),
				),
			},
		);
		if (!sourceCustomerProduct) {
			throw new Error("Expected pooled prepaid source customer product");
		}

		await autumnV2_2.billing.update({
			customer_id: customerId,
			customer_product_id: sourceCustomerProduct.id,
			entity_id: entities[0].id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 500 }],
		});

		const [poolAfterQuantityUpdate, contributionAfterQuantityUpdate] =
			await Promise.all([
				ctx.db.query.customerEntitlements.findFirst({
					where: eq(
						customerEntitlements.id,
						pool?.customer_entitlement_id ?? "missing",
					),
				}),
				ctx.db.query.pooledBalanceContributions.findFirst({
					where: eq(
						pooledBalanceContributions.source_customer_product_id,
						sourceCustomerProduct.id,
					),
				}),
			]);
		expect(poolAfterQuantityUpdate).toMatchObject({
			balance: 400,
			adjustment: 500,
		});
		expect(contributionAfterQuantityUpdate).toMatchObject({
			current_contribution: 500,
			next_cycle_contribution: 500,
		});

		const checkAfterQuantityUpdate = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(checkAfterQuantityUpdate.balance).toMatchObject({
			granted: 500,
			remaining: 400,
			usage: 100,
		});

		await autumnV2_2.billing.update({
			customer_id: customerId,
			customer_product_id: sourceCustomerProduct.id,
			entity_id: entities[0].id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});

		const [poolAfterScheduledDecrease, contributionAfterScheduledDecrease] =
			await Promise.all([
				ctx.db.query.customerEntitlements.findFirst({
					where: eq(
						customerEntitlements.id,
						pool?.customer_entitlement_id ?? "missing",
					),
				}),
				ctx.db.query.pooledBalanceContributions.findFirst({
					where: eq(
						pooledBalanceContributions.source_customer_product_id,
						sourceCustomerProduct.id,
					),
				}),
			]);
		expect(poolAfterScheduledDecrease).toMatchObject({
			balance: 400,
			adjustment: 500,
		});
		expect(contributionAfterScheduledDecrease).toMatchObject({
			current_contribution: 500,
			next_cycle_contribution: 200,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const stripeCustomerId = fullCustomer.processor?.id;
		if (!stripeCustomerId) throw new Error("Expected Stripe customer");
		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId,
			limit: 10,
		});
		const renewalInvoice = stripeInvoices.data.find(
			(invoice) => invoice.billing_reason === "subscription_cycle",
		);
		if (!renewalInvoice) throw new Error("Expected Stripe renewal invoice");
		const stripeEvent = {
			id: `evt_test_${renewalInvoice.id}`,
			object: "event",
			data: { object: renewalInvoice },
			type: "invoice.created",
		} as Stripe.InvoiceCreatedEvent;
		const stripeWebhookContext: StripeWebhookContext = {
			...ctx,
			fullCustomer,
			stripeEvent,
		};
		await handleStripeInvoiceCreated({
			ctx: stripeWebhookContext,
			event: stripeEvent,
		});
		// Stripe can redeliver the same invoice; replay must not mint the pool twice.
		await handleStripeInvoiceCreated({
			ctx: stripeWebhookContext,
			event: stripeEvent,
		});

		const [sourceAfterReset, poolAfterReset, contributionAfterReset] =
			await Promise.all([
				ctx.db.query.customerEntitlements.findFirst({
					where: eq(
						customerEntitlements.customer_product_id,
						sourceCustomerProduct.id,
					),
				}),
				ctx.db.query.customerEntitlements.findFirst({
					where: eq(
						customerEntitlements.id,
						pool?.customer_entitlement_id ?? "missing",
					),
				}),
				ctx.db.query.pooledBalanceContributions.findFirst({
					where: eq(
						pooledBalanceContributions.source_customer_product_id,
						sourceCustomerProduct.id,
					),
				}),
			]);
		expect(sourceAfterReset).toMatchObject({
			balance: 0,
			adjustment: 0,
			additional_balance: 0,
		});
		expect(poolAfterReset).toMatchObject({
			balance: 200,
			adjustment: 200,
		});
		expect(contributionAfterReset).toMatchObject({
			current_contribution: 200,
			next_cycle_contribution: 200,
		});

		const checkAfterReset = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(checkAfterReset.balance).toMatchObject({
			granted: 200,
			remaining: 200,
			usage: 0,
		});
	},
	90_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled items: multi-attach prepares every ordinary entity source")}`,
	async () => {
		const firstPlan = products.base({
			id: "ordinary-pooled-multi-first",
			isAddOn: true,
			items: [
				{
					...items.monthlyMessages({ includedUsage: 200 }),
					pooled: true,
				},
			],
		});
		const secondPlan = products.base({
			id: "ordinary-pooled-multi-second",
			isAddOn: true,
			items: [
				{
					...items.monthlyMessages({ includedUsage: 300 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "ordinary-pooled-multi-attach",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [firstPlan, secondPlan] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.multiAttach({
			customer_id: customerId,
			entity_id: entities[0].id,
			plans: [{ plan_id: firstPlan.id }, { plan_id: secondPlan.id }],
		});

		const internalCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		if (!internalCustomer) {
			throw new Error(`Customer '${customerId}' not found`);
		}
		const pools = await ctx.db.query.pooledBalances.findMany({
			where: eq(
				pooledBalances.internal_customer_id,
				internalCustomer.internal_id,
			),
		});
		expect(pools).toHaveLength(1);

		const [materializedPool, contributions] = await Promise.all([
			ctx.db.query.customerEntitlements.findFirst({
				where: eq(
					customerEntitlements.id,
					pools[0]?.customer_entitlement_id ?? "missing",
				),
			}),
			ctx.db.query.pooledBalanceContributions.findMany({
				where: eq(
					pooledBalanceContributions.pooled_balance_id,
					pools[0]?.id ?? "missing",
				),
			}),
		]);
		expect(materializedPool).toMatchObject({
			balance: 500,
			adjustment: 500,
		});
		expect(contributions).toHaveLength(2);
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled items: full item customization applies the contribution delta")}`,
	async () => {
		const pooledPlan = products.base({
			id: "ordinary-pooled-customize",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "ordinary-pooled-customize",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: pooledPlan.id,
		});
		await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 200,
		});

		await autumnV2_2.subscriptions.update({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: pooledPlan.id,
			customize: {
				items: [
					{
						...itemsV2.monthlyMessages({ included: 800 }),
						pooled: true,
					},
				],
			},
		});

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(check.balance).toMatchObject({
			granted: 800,
			remaining: 600,
			usage: 200,
		});

		const sourceCustomerProducts = await ctx.db.query.customerProducts.findMany(
			{
				where: and(
					eq(customerProducts.customer_id, customerId),
					eq(customerProducts.entity_id, entities[0].id),
				),
			},
		);
		const sourceCustomerProductIds = new Set(
			sourceCustomerProducts.map((customerProduct) => customerProduct.id),
		);
		const contributions =
			await ctx.db.query.pooledBalanceContributions.findMany();
		expect(
			contributions
				.filter((contribution) =>
					sourceCustomerProductIds.has(contribution.source_customer_product_id),
				)
				.reduce(
					(total, contribution) => total + contribution.current_contribution,
					0,
				),
		).toBe(800);
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled items: incremental item removal withdraws one source contribution")}`,
	async () => {
		const pooledPlan = products.base({
			id: "ordinary-pooled-remove-item",
			items: [
				items.dashboard(),
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "ordinary-pooled-remove-item",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: pooledPlan.id,
		});
		await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 200,
		});

		const sourceCustomerProduct = await ctx.db.query.customerProducts.findFirst(
			{
				where: and(
					eq(customerProducts.customer_id, customerId),
					eq(customerProducts.entity_id, entities[0].id),
				),
			},
		);
		if (!sourceCustomerProduct) {
			throw new Error("Expected pooled source before item removal");
		}
		const contributionBeforeRemoval =
			await ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					sourceCustomerProduct.id,
				),
			});
		if (!contributionBeforeRemoval) {
			throw new Error("Expected pooled contribution before item removal");
		}

		await autumnV2_2.subscriptions.update({
			customer_id: customerId,
			customer_product_id: sourceCustomerProduct.id,
			entity_id: entities[0].id,
			customize: {
				remove_items: [{ feature_id: TestFeature.Messages }],
			},
		});

		const [removedContribution, poolAfterRemoval] = await Promise.all([
			ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(pooledBalanceContributions.id, contributionBeforeRemoval.id),
			}),
			ctx.db.query.pooledBalances.findFirst({
				where: eq(
					pooledBalances.id,
					contributionBeforeRemoval.pooled_balance_id,
				),
			}),
		]);
		const materializedPool = await ctx.db.query.customerEntitlements.findFirst({
			where: eq(
				customerEntitlements.id,
				poolAfterRemoval?.customer_entitlement_id ?? "missing",
			),
		});
		expect(removedContribution).toMatchObject({
			current_contribution: 0,
			next_cycle_contribution: 0,
		});
		expect(materializedPool).toMatchObject({
			balance: -200,
			adjustment: 0,
		});

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(check.allowed).toBe(false);

		await autumnV2_2.subscriptions.update({
			customer_id: customerId,
			customer_product_id: sourceCustomerProduct.id,
			entity_id: entities[0].id,
			customize: {
				add_items: [
					{
						...itemsV2.monthlyMessages({ included: 700 }),
						pooled: true,
					},
				],
			},
		});

		const [poolAfterReattach, contributionsAfterReattach] = await Promise.all([
			ctx.db.query.customerEntitlements.findFirst({
				where: eq(
					customerEntitlements.id,
					poolAfterRemoval?.customer_entitlement_id ?? "missing",
				),
			}),
			ctx.db.query.pooledBalanceContributions.findMany({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					sourceCustomerProduct.id,
				),
			}),
		]);
		expect(poolAfterReattach).toMatchObject({
			balance: 500,
			adjustment: 700,
		});
		expect(
			contributionsAfterReattach.reduce(
				(total, contribution) => total + contribution.current_contribution,
				0,
			),
		).toBe(700);

		const checkAfterReattach = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(checkAfterReattach.balance).toMatchObject({
			granted: 700,
			remaining: 500,
			usage: 200,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled items: disable_pooled_balance still blocks entity fallback")}`,
	async () => {
		const pooledPlan = products.base({
			id: "ordinary-pooled-disabled-fallback",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2 } = await initScenario({
			customerId: "ordinary-pooled-disabled-fallback",
			setup: [
				s.customer({
					testClock: false,
					data: { config: { disable_pooled_balance: true } },
				}),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: pooledPlan.id,
		});

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(check.allowed).toBe(false);
		expect(check.balance).toBeNull();
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled items: overage-priced sources reject before customer state is written")}`,
	async () => {
		const invalidPlan = products.pro({
			id: "ordinary-pooled-overage-rejected",
			items: [
				{
					...items.consumableMessages({ includedUsage: 100 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "ordinary-pooled-overage-rejected",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [invalidPlan] }),
			],
			actions: [],
		});

		await expect(
			autumnV2_2.billing.attach({
				customer_id: customerId,
				entity_id: entities[0].id,
				plan_id: invalidPlan.id,
			}),
		).rejects.toThrow("must use recurring prepaid billing");

		const writtenCustomerProducts =
			await ctx.db.query.customerProducts.findMany({
				where: eq(customerProducts.customer_id, customerId),
			});
		expect(writtenCustomerProducts).toHaveLength(0);
	},
	60_000,
);

// A sibling cache fill must retain the first entity's live shared deduction.
test.concurrent(
	`${chalk.yellowBright("pooled items: entity usage limits independently gate a shared balance")}`,
	async () => {
		const pooledPlan = products.base({
			id: "ordinary-pooled-entity-usage-limit",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, autumnV2_3 } = await initScenario(
			{
				customerId: "ordinary-pooled-entity-usage-limit",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [pooledPlan] }),
				],
				actions: [],
			},
		);

		await Promise.all(
			entities.map((entity) =>
				autumnV2_2.billing.attach({
					customer_id: customerId,
					entity_id: entity.id,
					plan_id: pooledPlan.id,
				}),
			),
		);
		await setEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			limit: 300,
		});

		const limitedEntityTrack = (await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 300,
		})) as TrackResponseV3;
		expect(limitedEntityTrack.balance).toMatchObject({
			granted: 1000,
			remaining: 700,
			usage: 300,
		});
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: () =>
				autumnV2_3.track({
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});

		const siblingTrack = (await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 400,
		})) as TrackResponseV3;
		expect(siblingTrack.balance).toMatchObject({
			granted: 1000,
			remaining: 300,
			usage: 700,
		});
	},
	60_000,
);

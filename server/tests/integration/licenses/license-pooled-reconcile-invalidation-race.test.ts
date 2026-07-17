import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	CusProductStatus,
	customerEntitlements,
	customerLicenses,
	customerProducts,
	customers,
	pooledBalanceContributions,
	pooledBalances,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";

const waitForBarrier = async ({
	barrier,
	timeoutMs,
}: {
	barrier: Promise<void>;
	timeoutMs: number;
}): Promise<void> => {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			barrier,
			new Promise<never>((_, reject) => {
				timeoutId = setTimeout(
					() =>
						reject(
							new Error(
								"Timed out waiting for final license cache invalidation",
							),
						),
					timeoutMs,
				);
			}),
		]);
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
	}
};

/** A track racing final license-reconcile invalidation must be flushed instead of deleted. */
test.concurrent(
	`${chalk.yellowBright("licenses pooled race: stable-link parent upgrade preserves a track at final invalidation")}`,
	async () => {
		const firstParent = products.pro({
			id: "pooled-reconcile-race-parent-a",
			items: [items.dashboard()],
		});
		const successorParent = products.premium({
			id: "pooled-reconcile-race-parent-b",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "pooled-reconcile-race-license",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "license-pooled-reconcile-invalidation-race",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
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

		const internalCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		if (!internalCustomer) throw new Error("Expected pooled race customer");

		const firstParentCustomerProduct = (
			await ctx.db.query.customerProducts.findMany({
				where: eq(
					customerProducts.internal_customer_id,
					internalCustomer.internal_id,
				),
				with: { product: true },
			})
		).find((customerProduct) => customerProduct.product.id === firstParent.id);
		if (!firstParentCustomerProduct) {
			throw new Error("Expected first pooled license parent");
		}

		const commonAnchor = Date.now() - 60_000;
		await ctx.db
			.update(customerProducts)
			.set({ billing_cycle_anchor: commonAnchor })
			.where(eq(customerProducts.id, firstParentCustomerProduct.id));
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "pooled-reconcile-race-anchor-a",
		});

		const firstCustomerLicense = await ctx.db.query.customerLicenses.findFirst({
			where: eq(
				customerLicenses.parent_customer_product_id,
				firstParentCustomerProduct.id,
			),
		});
		if (!firstCustomerLicense) {
			throw new Error("Expected first customer license");
		}
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			plan_id: license.id,
			entities: [{ entity_id: entities[0].id }],
		});
		const assignment = await ctx.db.query.customerProducts.findFirst({
			where: and(
				eq(
					customerProducts.customer_license_link_id,
					firstCustomerLicense.link_id,
				),
				eq(customerProducts.entity_id, entities[0].id),
			),
		});
		if (!assignment) throw new Error("Expected pooled license assignment");

		const assignmentBeforeUpgrade =
			await ctx.db.query.customerProducts.findFirst({
				where: eq(customerProducts.id, assignment.id),
			});
		expect(assignmentBeforeUpgrade).toMatchObject({
			customer_license_link_id: firstCustomerLicense.link_id,
			status: CusProductStatus.Active,
		});

		const contributionBeforeReconcile =
			await ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					assignment.id,
				),
			});
		expect(contributionBeforeReconcile).toMatchObject({
			reset_owner_id: firstParentCustomerProduct.id,
			current_contribution: 500,
			next_cycle_contribution: 500,
		});
		if (!contributionBeforeReconcile) {
			throw new Error("Expected pooled contribution before reconciliation");
		}

		await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 200,
			overage_behavior: "reject",
		});
		const fullSubject = await getOrSetCachedFullSubject({
			ctx,
			customerId,
			entityId: entities[1].id,
			source: "pooled-reconcile-invalidation-race",
		});

		const subjectKey = buildFullSubjectKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
		});
		let signalFinalInvalidation: (() => void) | undefined;
		const finalInvalidationReached = new Promise<void>((resolve) => {
			signalFinalInvalidation = resolve;
		});
		let releaseFinalInvalidation: (() => void) | undefined;
		const finalInvalidationRelease = new Promise<void>((resolve) => {
			releaseFinalInvalidation = resolve;
		});
		let finalInvalidationSignaled = false;

		const redisV2 = new Proxy(ctx.redisV2, {
			get(target, property) {
				if (property === "get") {
					return async (key: string) => {
						const value = await target.get(key);
						if (key === subjectKey && !finalInvalidationSignaled) {
							finalInvalidationSignaled = true;
							signalFinalInvalidation?.();
							await finalInvalidationRelease;
						}
						return value;
					};
				}

				const value = Reflect.get(target, property, target) as unknown;
				return typeof value === "function" ? value.bind(target) : value;
			},
		}) as AutumnContext["redisV2"];
		const raceContext = { ...ctx, redisV2 } as AutumnContext;

		const upgradePromise = billingActions.attach({
			ctx: raceContext,
			params: {
				customer_id: customerId,
				plan_id: successorParent.id,
				redirect_mode: "never",
			},
			skipAutumnCheckout: true,
		});

		let deductionError: unknown;
		try {
			await waitForBarrier({
				barrier: finalInvalidationReached,
				timeoutMs: 20_000,
			});
			const messagesFeature = ctx.features.find(
				(feature) => feature.id === TestFeature.Messages,
			);
			if (!messagesFeature) throw new Error("Expected messages feature");

			await executeRedisDeductionV2({
				ctx: raceContext,
				fullSubject: structuredClone(fullSubject),
				entityId: entities[1].id,
				deductions: [{ feature: messagesFeature, deduction: 100 }],
				deductionOptions: { overageBehaviour: "reject" },
			});
		} catch (error) {
			deductionError = error;
		} finally {
			releaseFinalInvalidation?.();
		}

		await upgradePromise;
		expect(deductionError).toBeUndefined();
		expect(finalInvalidationSignaled).toBe(true);

		const successorParentCustomerProduct = (
			await ctx.db.query.customerProducts.findMany({
				where: eq(
					customerProducts.internal_customer_id,
					internalCustomer.internal_id,
				),
				with: { product: true },
			})
		).find(
			(customerProduct) =>
				customerProduct.product.id === successorParent.id &&
				customerProduct.status === CusProductStatus.Active,
		);
		if (!successorParentCustomerProduct) {
			throw new Error("Expected successor pooled license parent");
		}
		const successorCustomerLicense =
			await ctx.db.query.customerLicenses.findFirst({
				where: eq(
					customerLicenses.parent_customer_product_id,
					successorParentCustomerProduct.id,
				),
			});
		expect(successorCustomerLicense?.link_id).toBe(
			firstCustomerLicense.link_id,
		);

		const assignmentAfterUpgrade =
			await ctx.db.query.customerProducts.findFirst({
				where: eq(customerProducts.id, assignment.id),
			});
		expect(assignmentAfterUpgrade).toMatchObject({
			customer_license_link_id: firstCustomerLicense.link_id,
			status: CusProductStatus.Active,
		});

		const contributionAfterReconcile =
			await ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					assignment.id,
				),
			});
		expect(contributionAfterReconcile).toMatchObject({
			id: contributionBeforeReconcile.id,
			pooled_balance_id: contributionBeforeReconcile.pooled_balance_id,
			reset_owner_id: successorParentCustomerProduct.id,
			current_contribution: 500,
			next_cycle_contribution: 500,
		});

		const pool = await ctx.db.query.pooledBalances.findFirst({
			where: eq(
				pooledBalances.id,
				contributionBeforeReconcile.pooled_balance_id,
			),
		});
		if (!pool) throw new Error("Expected pooled balance after reconciliation");
		const poolCustomerEntitlement =
			await ctx.db.query.customerEntitlements.findFirst({
				where: eq(customerEntitlements.id, pool.customer_entitlement_id),
			});
		expect(poolCustomerEntitlement).toMatchObject({
			adjustment: 500,
			balance: 200,
		});

		const [cachedCheck, databaseCheck] = await Promise.all([
			autumnV2_2.check<CheckResponseV3>({
				customer_id: customerId,
				entity_id: entities[1].id,
				feature_id: TestFeature.Messages,
			}),
			autumnV2_2.check<CheckResponseV3>({
				customer_id: customerId,
				entity_id: entities[1].id,
				feature_id: TestFeature.Messages,
				skip_cache: true,
			}),
		]);
		for (const check of [cachedCheck, databaseCheck]) {
			expect(check.balance).toMatchObject({
				granted: 500,
				remaining: 200,
				usage: 300,
			});
		}
	},
	90_000,
);

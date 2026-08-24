/**
 * Contract: graduated credit cards charge marginal cumulative usage, advance
 * tier position with the balance atomically, and keep Redis/Postgres parity.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	customerEntitlements,
	fullSubjectToCustomerEntitlements,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { executePostgresDeductionV2 } from "@/internal/balances/utils/deductionV2/executePostgresDeductionV2.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";
import { getCachedFeatureBalance } from "@/internal/customers/cache/fullSubject/balances/getCachedFeatureBalances.js";

const makeCreditProduct = ({
	id,
	withOwnAllowance = false,
}: {
	id: string;
	withOwnAllowance?: boolean;
}) =>
	products.base({
		id,
		items: [
			...(withOwnAllowance
				? [
						items.free({
							featureId: TestFeature.TieredAction,
							includedUsage: 50,
						}),
					]
				: []),
			items.free({
				featureId: TestFeature.TieredCredits,
				includedUsage: 1_000,
			}),
		],
	});

const getPersistedCreditEntitlement = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	internalCustomerId: string;
}) => {
	const rows = await ctx.db
		.select({
			balance: customerEntitlements.balance,
			usageAttribution: customerEntitlements.usage_attribution,
		})
		.from(customerEntitlements)
		.where(
			and(
				eq(customerEntitlements.internal_customer_id, internalCustomerId),
				eq(customerEntitlements.feature_id, TestFeature.TieredCredits),
			),
		)
		.limit(1);

	return rows[0];
};

test.concurrent(
	`${chalk.yellowBright("graduated-credit-rating: Redis handles checks, concurrent boundary crossing, and refunds")}`,
	async () => {
		const customerId = "graduated-credit-rating-redis";
		const product = makeCreditProduct({ id: "graduated-credit-redis" });
		const { autumnV1, autumnV2_3, customer, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			value: 9_950,
		});

		const check = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			required_balance: 100,
		});
		expect(check.allowed).toBe(true);
		expect(check.required_balance).toBeCloseTo(0.9, 10);

		await Promise.all([
			autumnV2_3.track({
				customer_id: customerId,
				feature_id: TestFeature.TieredAction,
				value: 100,
			}),
			autumnV2_3.track({
				customer_id: customerId,
				feature_id: TestFeature.TieredAction,
				value: 100,
			}),
		]);

		const afterConcurrent =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(
			afterConcurrent.features[TestFeature.TieredCredits].balance,
		).toBeCloseTo(898.8, 10);

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			value: -200,
		});

		const afterRefund = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(afterRefund.features[TestFeature.TieredCredits].balance).toBeCloseTo(
			900.5,
			10,
		);

		await timeout(3_000);
		const persisted = await getPersistedCreditEntitlement({
			ctx,
			internalCustomerId: customer.internal_id,
		});
		const sourceInternalFeatureId = ctx.features.find(
			(feature) => feature.id === TestFeature.TieredAction,
		)?.internal_id;
		expect(sourceInternalFeatureId).toBeDefined();
		expect(persisted?.balance).toBeCloseTo(900.5, 10);
		expect(persisted?.usageAttribution[sourceInternalFeatureId!]).toEqual({
			units: 9_950,
			credits: 99.5,
		});

		// Reserve across the first tier boundary, then finalize below the
		// reservation. Only the final 100 source units (0.8 credits) unwind.
		await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			required_balance: 200,
			lock: {
				enabled: true,
				lock_id: `${customerId}-partial`,
			},
		});
		await autumnV2_3.balances.finalize({
			lock_id: `${customerId}-partial`,
			action: "confirm",
			override_value: 100,
		});
		const afterPartialFinalize =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(
			afterPartialFinalize.features[TestFeature.TieredCredits].balance,
		).toBeCloseTo(899.6, 10);

		// Finalizing above the reservation keeps the reserve and rates the extra
		// units from the already-advanced tier position.
		await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			required_balance: 50,
			lock: {
				enabled: true,
				lock_id: `${customerId}-higher`,
			},
		});
		await autumnV2_3.balances.finalize({
			lock_id: `${customerId}-higher`,
			action: "confirm",
			override_value: 100,
		});

		// A release is a full unwind of both the balance and attribution entry.
		await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			required_balance: 100,
			lock: {
				enabled: true,
				lock_id: `${customerId}-release`,
			},
		});
		await autumnV2_3.balances.finalize({
			lock_id: `${customerId}-release`,
			action: "release",
		});

		const afterLockLifecycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(
			afterLockLifecycle.features[TestFeature.TieredCredits].balance,
		).toBeCloseTo(898.8, 10);

		await timeout(3_000);
		const afterLockPersisted = await getPersistedCreditEntitlement({
			ctx,
			internalCustomerId: customer.internal_id,
		});
		expect(
			afterLockPersisted?.usageAttribution[sourceInternalFeatureId!],
		).toEqual({
			units: 10_150,
			credits: 101.2,
		});
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("graduated-credit-rating: only usage spilling past the source allowance enters the card")}`,
	async () => {
		const customerId = "graduated-credit-rating-spill";
		const product = makeCreditProduct({
			id: "graduated-credit-spill",
			withOwnAllowance: true,
		});
		const { autumnV1, autumnV2_3, customer, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			value: 100,
		});

		const response = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(response.features[TestFeature.TieredAction].balance).toBe(0);
		expect(response.features[TestFeature.TieredCredits].balance).toBeCloseTo(
			999.5,
			10,
		);

		await timeout(3_000);
		const persisted = await getPersistedCreditEntitlement({
			ctx,
			internalCustomerId: customer.internal_id,
		});
		const sourceInternalFeatureId = ctx.features.find(
			(feature) => feature.id === TestFeature.TieredAction,
		)?.internal_id;
		expect(persisted?.usageAttribution[sourceInternalFeatureId!]).toEqual({
			units: 50,
			credits: 0.5,
		});
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("graduated-credit-rating: releasing a lock reprices from the current tier position")}`,
	async () => {
		const customerId = "graduated-credit-rating-lock-current-position";
		const product = makeCreditProduct({
			id: "graduated-credit-lock-current-position",
		});
		const { autumnV1, autumnV2_3, customer, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			value: 9_900,
		});
		await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			required_balance: 50,
			lock: {
				enabled: true,
				lock_id: `${customerId}-release`,
			},
		});

		// Releasing the earlier 50 units removes the current marginal tail (0.4
		// credits), leaving cost(10,000), rather than its original 0.5-credit cost.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			value: 100,
		});
		await autumnV2_3.balances.finalize({
			lock_id: `${customerId}-release`,
			action: "release",
		});

		const response = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(response.features[TestFeature.TieredCredits].balance).toBeCloseTo(
			900,
			10,
		);

		await timeout(3_000);
		const persisted = await getPersistedCreditEntitlement({
			ctx,
			internalCustomerId: customer.internal_id,
		});
		const sourceInternalFeatureId = ctx.features.find(
			(feature) => feature.id === TestFeature.TieredAction,
		)?.internal_id;
		expect(sourceInternalFeatureId).toBeDefined();
		expect(persisted?.usageAttribution[sourceInternalFeatureId!]).toEqual({
			units: 10_000,
			credits: 100,
		});
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("graduated-credit-rating: Postgres fallback matches marginal rating")}`,
	async () => {
		const customerId = "graduated-credit-rating-postgres";
		const product = makeCreditProduct({ id: "graduated-credit-postgres" });
		const { autumnV2_3, customer, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.attach({ productId: product.id })],
		});
		const fullSubject = await getOrSetCachedFullSubject({
			ctx,
			customerId,
			source: "track-graduated-credit-system-test",
		});
		const feature = ctx.features.find(
			(candidate) => candidate.id === TestFeature.TieredAction,
		);
		expect(feature).toBeDefined();
		const creditEntitlement = fullSubjectToCustomerEntitlements({
			fullSubject,
			featureIds: [TestFeature.TieredCredits],
		})[0];
		expect(creditEntitlement).toBeDefined();

		await executePostgresDeductionV2({
			ctx,
			fullSubject,
			customerId,
			deductions: [{ feature: feature!, deduction: 10_050 }],
		});

		const persisted = await getPersistedCreditEntitlement({
			ctx,
			internalCustomerId: customer.internal_id,
		});
		const sourceInternalFeatureId = feature!.internal_id;
		expect(persisted?.balance).toBeCloseTo(899.6, 10);
		expect(persisted?.usageAttribution[sourceInternalFeatureId]).toEqual({
			units: 10_050,
			credits: 100.4,
		});

		const cached = await getCachedFeatureBalance({
			ctx,
			customerId,
			featureId: TestFeature.TieredCredits,
			customerEntitlementIds: [creditEntitlement.id],
			readMaster: true,
		});
		expect(cached.kind).toBe("ok");
		if (cached.kind === "ok") {
			expect(
				cached.value.balances[0]?.usage_attribution?.[sourceInternalFeatureId],
			).toEqual({ units: 10_050, credits: 100.4 });
		}

		const lockId = `${customerId}-postgres-release`;
		await executePostgresDeductionV2({
			ctx,
			fullSubject,
			customerId,
			deductions: [
				{
					feature: feature!,
					deduction: 50,
					lock: { enabled: true, lock_id: lockId },
				},
			],
		});
		await executePostgresDeductionV2({
			ctx,
			fullSubject,
			customerId,
			deductions: [{ feature: feature!, deduction: 100 }],
		});
		await autumnV2_3.balances.finalize(
			{ lock_id: lockId, action: "release" },
			{ skipCache: true },
		);

		const afterPostgresRelease = await getPersistedCreditEntitlement({
			ctx,
			internalCustomerId: customer.internal_id,
		});
		expect(afterPostgresRelease?.balance).toBeCloseTo(898.8, 10);
		expect(
			afterPostgresRelease?.usageAttribution[sourceInternalFeatureId],
		).toEqual({ units: 10_150, credits: 101.2 });
	},
	{ timeout: 120_000 },
);

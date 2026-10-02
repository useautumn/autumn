import { getApiBalances } from "@api/customers/cusFeatures";
import {
	CusProductStatus,
	type FullCustomer,
	type FullCustomerEntitlement,
	orgToInStatuses,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	type AttributedBalance,
	attributePooledBalance,
	customerProductsToPooledContributions,
	type PooledContribution,
	type PoolTotals,
} from "@/internal/billing/v2/pooledBalances/attribution/attributePooledBalances";
import type { PhaseBalances } from "../diffPhaseBalances";
import type {
	BalanceScope,
	ScopedPhaseBalances,
	ScopePool,
} from "./types/scopedPhaseBalances";

type ScopedRow = { internal_entity_id?: string | null };

const internalEntityIdOf = (row: ScopedRow) => row.internal_entity_id ?? null;

/** Stored trialing plans are Active with a trial end, the only shape balances read. */
const withTrialingPlansActive = (fullCustomer: FullCustomer): FullCustomer => ({
	...fullCustomer,
	customer_products: fullCustomer.customer_products.map((customerProduct) =>
		customerProduct.status === CusProductStatus.Trialing
			? { ...customerProduct, status: CusProductStatus.Active }
			: customerProduct,
	),
});

const balanceScopesOf = (fullCustomer: FullCustomer): BalanceScope[] => {
	const rows: ScopedRow[] = [
		...fullCustomer.customer_products,
		...(fullCustomer.extra_customer_entitlements ?? []),
	];
	const internalEntityIds = new Set<string | null>([
		null,
		...rows.map(internalEntityIdOf),
	]);

	return [...internalEntityIds].map((internalEntityId) => ({
		internalEntityId,
		entityId:
			internalEntityId === null
				? null
				: (fullCustomer.entities?.find(
						(entity) => entity.internal_id === internalEntityId,
					)?.id ?? internalEntityId),
	}));
};

const inScope =
	(scope: BalanceScope) =>
	(row: ScopedRow): boolean =>
		internalEntityIdOf(row) === scope.internalEntityId;

/**
 * Only the rows a scope owns: an entity read would also inherit customer-level plans, so scopes are sliced.
 * Pools are left out; their grants are attributed to the plans that contribute them.
 */
const scopeFullCustomer = ({
	fullCustomer,
	scope,
}: {
	fullCustomer: FullCustomer;
	scope: BalanceScope;
}): FullCustomer => ({
	...fullCustomer,
	entity: undefined,
	customer_products: fullCustomer.customer_products.filter(inScope(scope)),
	extra_customer_entitlements: (
		fullCustomer.extra_customer_entitlements ?? []
	).filter(inScope(scope)),
	pooled_customer_entitlements: [],
});

/** The given pools as the API reads them, summed per feature. */
const poolsToTotals = async ({
	ctx,
	fullCustomer,
	pooledCustomerEntitlements,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	pooledCustomerEntitlements: FullCustomerEntitlement[];
}): Promise<Record<string, PoolTotals>> => {
	const { balances } = await getApiBalances({
		ctx,
		fullCus: {
			...fullCustomer,
			entity: undefined,
			customer_products: [],
			extra_customer_entitlements: [],
			pooled_customer_entitlements: pooledCustomerEntitlements,
		},
	});
	return balances;
};

/** A contribution's pool, or the feature's pools together while billing has not linked it yet. */
const poolKeyOf = ({
	featureId,
	contribution,
}: {
	featureId: string;
	contribution: PooledContribution;
}) => contribution.poolId ?? `feature:${featureId}`;

/** Every scope's contributions summed per pool, the denominator each contributor's share is cut from. */
const contributionTotalsByPoolKey = (
	scopeContributions: Record<string, PooledContribution[]>[],
) => {
	const totals = new Map<string, number>();
	for (const contributions of scopeContributions) {
		for (const [featureId, featureContributions] of Object.entries(
			contributions,
		)) {
			for (const contribution of featureContributions) {
				const key = poolKeyOf({ featureId, contribution });
				totals.set(key, (totals.get(key) ?? 0) + contribution.contribution);
			}
		}
	}
	return totals;
};

/** Each pool's totals by pool key: its own pool, plus every feature's pools together. */
const customerToPoolTotalsByKey = async ({
	ctx,
	fullCustomer,
	featureTotals,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	featureTotals: Record<string, PoolTotals>;
}) => {
	const totalsByKey = new Map<string, PoolTotals>(
		Object.entries(featureTotals).map(([featureId, totals]) => [
			`feature:${featureId}`,
			totals,
		]),
	);
	for (const pool of fullCustomer.pooled_customer_entitlements ?? []) {
		if (!pool.pooled_balance_id) continue;
		const totals = await poolsToTotals({
			ctx,
			fullCustomer,
			pooledCustomerEntitlements: [pool],
		});
		const poolTotals = totals[pool.entitlement.feature.id];
		if (poolTotals) totalsByKey.set(pool.pooled_balance_id, poolTotals);
	}
	return totalsByKey;
};

/** The customer's balances per scope: customer-level plans, then each entity's own plans. */
export const customerToScopedBalances = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<ScopedPhaseBalances> => {
	const readableCustomer = withTrialingPlansActive(fullCustomer);
	const inStatuses = orgToInStatuses({ org: ctx.org });
	const poolTotals = await poolsToTotals({
		ctx,
		fullCustomer: readableCustomer,
		pooledCustomerEntitlements:
			readableCustomer.pooled_customer_entitlements ?? [],
	});
	const poolTotalsByKey = await customerToPoolTotalsByKey({
		ctx,
		fullCustomer: readableCustomer,
		featureTotals: poolTotals,
	});

	const scopes = balanceScopesOf(readableCustomer).map((scope) => {
		const scopeCustomer = scopeFullCustomer({
			fullCustomer: readableCustomer,
			scope,
		});
		const contributions = customerProductsToPooledContributions({
			customerProducts: scopeCustomer.customer_products,
			inStatuses,
		});
		return { scope, scopeCustomer, contributions };
	});
	const contributorCount = (featureId: string) =>
		scopes.filter(({ contributions }) => featureId in contributions).length;
	const contributionTotalsByKey = contributionTotalsByPoolKey(
		scopes.map(({ contributions }) => contributions),
	);

	return Promise.all(
		scopes.map(async ({ scope, scopeCustomer, contributions }) => {
			const { balances: ownBalances } = await getApiBalances({
				ctx,
				fullCus: scopeCustomer,
			});
			const balances: PhaseBalances = { ...ownBalances };
			const pools: Record<string, ScopePool> = {};
			for (const [featureId, featureContributions] of Object.entries(
				contributions,
			)) {
				let balance: AttributedBalance | undefined = ownBalances[featureId];
				for (const contribution of featureContributions) {
					const key = poolKeyOf({ featureId, contribution });
					balance = attributePooledBalance({
						own: balance,
						contribution,
						pool: poolTotalsByKey.get(key),
						poolContributions: contributionTotalsByKey.get(key) ?? 0,
					});
				}
				if (balance) balances[featureId] = balance;
				pools[featureId] = {
					total: poolTotals[featureId]?.granted ?? 0,
					contributors: contributorCount(featureId),
				};
			}
			return { scope, balances, pools };
		}),
	);
};

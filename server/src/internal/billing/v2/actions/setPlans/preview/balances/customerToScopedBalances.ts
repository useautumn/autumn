import { getApiBalances } from "@api/customers/cusFeatures";
import {
	CusProductStatus,
	type FullCustomer,
	orgToInStatuses,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	attributePooledBalance,
	customerProductsToPooledContributions,
	type PoolTotals,
} from "@/internal/billing/v2/pooledBalances/attribution/attributePooledBalances";
import type { PhaseBalances } from "../diffPhaseBalances";
import type {
	BalanceScope,
	ScopedPhaseBalances,
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

/** Each feature's shared pools as the API reads them, summed across pools. */
const customerToPoolTotals = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<Record<string, PoolTotals>> => {
	const { balances } = await getApiBalances({
		ctx,
		fullCus: {
			...fullCustomer,
			entity: undefined,
			customer_products: [],
			extra_customer_entitlements: [],
		},
	});
	return balances;
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
	const poolTotals = await customerToPoolTotals({
		ctx,
		fullCustomer: readableCustomer,
	});

	return Promise.all(
		balanceScopesOf(readableCustomer).map(async (scope) => {
			const scopeCustomer = scopeFullCustomer({
				fullCustomer: readableCustomer,
				scope,
			});
			const { balances: ownBalances } = await getApiBalances({
				ctx,
				fullCus: scopeCustomer,
			});
			const contributions = customerProductsToPooledContributions({
				customerProducts: scopeCustomer.customer_products,
				inStatuses,
			});
			const balances: PhaseBalances = { ...ownBalances };
			for (const [featureId, contribution] of Object.entries(contributions)) {
				balances[featureId] = attributePooledBalance({
					own: ownBalances[featureId],
					contribution,
					pool: poolTotals[featureId],
				});
			}
			return { scope, balances };
		}),
	);
};

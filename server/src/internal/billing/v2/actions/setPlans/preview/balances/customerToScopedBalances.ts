import { getApiBalances } from "@api/customers/cusFeatures";
import {
	CusProductStatus,
	type FullCustomer,
	type FullCustomerEntitlement,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
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
		...(fullCustomer.pooled_customer_entitlements ?? []),
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

/** Only the rows a scope owns: entity plans are never read through the customer, nor the reverse. */
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
	pooled_customer_entitlements: (
		(fullCustomer.pooled_customer_entitlements ??
			[]) as FullCustomerEntitlement[]
	).filter(inScope(scope)),
});

/** The customer's balances per scope: customer-level plans, then each entity's own plans. */
export const customerToScopedBalances = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<ScopedPhaseBalances> => {
	const readableCustomer = withTrialingPlansActive(fullCustomer);

	return Promise.all(
		balanceScopesOf(readableCustomer).map(async (scope) => {
			const { balances } = await getApiBalances({
				ctx,
				fullCus: scopeFullCustomer({ fullCustomer: readableCustomer, scope }),
			});
			return { scope, balances };
		}),
	);
};

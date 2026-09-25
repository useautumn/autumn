import { CatalogRowMissingError } from "../../errors.js";
import type { Catalog } from "../../models/catalog/catalog.js";
import {
	type WorkerCustomerEntitlement,
	workerCustomerEntitlementSchema,
} from "../../models/subject/rows/workerCustomerEntitlement.js";
import type { WorkerCustomerPrice } from "../../models/subject/rows/workerCustomerPrice.js";
import type { WorkerPooledBalance } from "../../models/subject/rows/workerPooledBalance.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import type {
	WorkerFullCustomerEntitlement,
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullCustomerPrice,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import { parseWorkerCustomerEntitlement } from "../../parsers.js";
import { inheritParentCustomerProductLifecycle } from "./inheritParentCustomerProductLifecycle.js";

/**
 * The state's child rows grouped by the parent they hang off, built once per
 * conversion. The joins below used to filter the whole array for every row,
 * which made a large customer's view quadratic in its row count; a track
 * builds the view twice (as found and as left), so that was where its thread
 * time went.
 */
type SubjectRowIndex = {
	rolloversByRow: Map<string, SubjectState["rollovers"]>;
	replaceablesByRow: Map<string, SubjectState["replaceables"]>;
	poolsById: Map<string, WorkerPooledBalance>;
	pricesByProduct: Map<string, WorkerCustomerPrice[]>;
	entitlementsByProduct: Map<string, WorkerCustomerEntitlement[]>;
};

const groupBy = <Row>(
	rows: readonly Row[],
	keyOf: (row: Row) => string | null | undefined,
): Map<string, Row[]> => {
	const groups = new Map<string, Row[]>();
	for (const row of rows) {
		const key = keyOf(row);
		if (key === null || key === undefined) continue;
		const group = groups.get(key);
		if (group) group.push(row);
		else groups.set(key, [row]);
	}
	return groups;
};

const indexSubjectRows = ({
	state,
}: {
	state: SubjectState;
}): SubjectRowIndex => ({
	rolloversByRow: groupBy(state.rollovers, (row) => row.cus_ent_id),
	replaceablesByRow: groupBy(state.replaceables, (row) => row.cus_ent_id),
	poolsById: new Map(state.pooledBalances.map((pool) => [pool.id, pool])),
	pricesByProduct: groupBy(
		state.customerPrices,
		(row) => row.customer_product_id,
	),
	entitlementsByProduct: groupBy(
		state.customerEntitlements,
		(row) => row.customer_product_id,
	),
});

/** The pool a pooled row draws from, present only when the row names one the state holds. */
const poolOf = ({
	row,
	index,
}: {
	row: WorkerCustomerEntitlement;
	index: SubjectRowIndex;
}): { pooled_balance?: WorkerPooledBalance } => {
	const pool =
		row.pooled_balance_id === null || row.pooled_balance_id === undefined
			? undefined
			: index.poolsById.get(row.pooled_balance_id);
	return pool ? { pooled_balance: pool } : {};
};

const joinCustomerEntitlement = ({
	row,
	index,
	catalog,
}: {
	row: WorkerCustomerEntitlement;
	index: SubjectRowIndex;
	catalog: Catalog;
}): WorkerFullCustomerEntitlement => {
	const entitlement = catalog.entitlements[row.entitlement_id];
	if (!entitlement)
		throw new CatalogRowMissingError({
			table: "entitlements",
			id: row.entitlement_id,
		});
	const feature = catalog.features[row.internal_feature_id];
	if (!feature)
		throw new CatalogRowMissingError({
			table: "features",
			id: row.internal_feature_id,
		});
	return {
		...row,
		entitlement: { ...entitlement, feature },
		rollovers: index.rolloversByRow.get(row.id) ?? [],
		replaceables: index.replaceablesByRow.get(row.id) ?? [],
		...poolOf({ row, index }),
	};
};

/** A customer price without a price row is a placeholder the deduction never reads; it joins as no price. */
const joinCustomerPrice = ({
	row,
	catalog,
}: {
	row: WorkerCustomerPrice;
	catalog: Catalog;
}): WorkerFullCustomerPrice => {
	const price = row.price_id ? catalog.prices[row.price_id] : undefined;
	if (!price)
		throw new CatalogRowMissingError({
			table: "prices",
			id: row.price_id ?? row.id,
		});
	return { ...row, price };
};

/** The one place rows meet catalog. Everything downstream speaks the FullSubject shape. */
export const subjectStateToFullSubject = ({
	state,
	catalog,
	entityId = null,
}: {
	state: SubjectState;
	catalog: Catalog;
	entityId?: string | null;
}): WorkerFullSubject => {
	const index = indexSubjectRows({ state });
	const join = (row: WorkerCustomerEntitlement) =>
		joinCustomerEntitlement({ row, index, catalog });
	const liveProducts = state.customerProducts.flatMap((row) => {
		const customerProduct = inheritParentCustomerProductLifecycle({
			row,
			state,
		});
		return customerProduct ? [customerProduct] : [];
	});
	const customer_products = liveProducts.map((customerProduct) => {
		const product = catalog.products[customerProduct.internal_product_id];
		if (!product)
			throw new CatalogRowMissingError({
				table: "products",
				id: customerProduct.internal_product_id,
			});
		return {
			...customerProduct,
			product,
			customer_prices: (
				index.pricesByProduct.get(customerProduct.id) ?? []
			).map((row) => joinCustomerPrice({ row, catalog })),
			customer_entitlements: (
				index.entitlementsByProduct.get(customerProduct.id) ?? []
			).map(join),
		};
	});
	// A dead seat's rows stay with it: a grant whose product the state holds is never loose.
	const heldProductIds = new Set(state.customerProducts.map((row) => row.id));
	const isPool = (row: WorkerCustomerEntitlement) =>
		row.is_pooled_balance === true;
	const extra_customer_entitlements = state.customerEntitlements
		.filter(
			(row) =>
				!isPool(row) &&
				(row.customer_product_id === null ||
					!heldProductIds.has(row.customer_product_id)),
		)
		.map(join);
	const pooled_customer_entitlements = state.customerEntitlements
		.filter(isPool)
		.map(join);

	return {
		identity: { ...state.identity, entityId },
		revision: state.revision,
		customer: state.customer,
		entity: entityId && state.entity?.id === entityId ? state.entity : null,
		customer_products,
		extra_customer_entitlements,
		pooled_customer_entitlements,
		usage_windows: state.usageWindows,
		open_locks: state.openLocks,
	};
};

/** Every balance row the subject holds with the plan that granted it, selected or not: a finalize or a reset can land on a row a track would skip. */
export const fullSubjectToHeldRows = ({
	fullSubject,
}: {
	fullSubject: WorkerFullSubject;
}): WorkerFullCustomerEntitlementWithProduct[] => [
	...fullSubject.customer_products.flatMap((customerProduct) =>
		customerProduct.customer_entitlements.map((customerEntitlement) => ({
			...customerEntitlement,
			customer_product: customerProduct,
		})),
	),
	...[
		...fullSubject.extra_customer_entitlements,
		...fullSubject.pooled_customer_entitlements,
	].map((customerEntitlement) => ({
		...customerEntitlement,
		customer_product: null,
	})),
];

/** Back to the stored row: joined catalog rows and the product the selection attached never travel in a mutation. */
export const fullCustomerEntitlementToRow = ({
	customerEntitlement,
}: {
	customerEntitlement: WorkerFullCustomerEntitlement;
}): WorkerCustomerEntitlement =>
	parseWorkerCustomerEntitlement({
		input: Object.fromEntries(
			Object.keys(workerCustomerEntitlementSchema.shape)
				.map((column) => [column, Reflect.get(customerEntitlement, column)])
				.filter(([, value]) => value !== undefined),
		),
	});

/** The subject with some grants edited or removed (`edit` returns null): a what-if view a balance edit draws on. */
export const fullSubjectWithCustomerEntitlements = ({
	fullSubject,
	edit,
}: {
	fullSubject: WorkerFullSubject;
	edit: (
		customerEntitlement: WorkerFullCustomerEntitlement,
	) => WorkerFullCustomerEntitlement | null;
}): WorkerFullSubject => {
	const editAll = <Row extends WorkerFullCustomerEntitlement>(rows: Row[]) =>
		rows.flatMap((row) => {
			const edited = edit(row);
			return edited ? [{ ...row, ...edited }] : [];
		});
	return {
		...fullSubject,
		customer_products: fullSubject.customer_products.map((customerProduct) => ({
			...customerProduct,
			customer_entitlements: editAll(customerProduct.customer_entitlements),
		})),
		extra_customer_entitlements: editAll(
			fullSubject.extra_customer_entitlements,
		),
	};
};

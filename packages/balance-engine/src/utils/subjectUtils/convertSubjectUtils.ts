import { CatalogRowMissingError } from "../../errors.js";
import type { Catalog } from "../../models/catalog/catalog.js";
import {
	type WorkerCustomerEntitlement,
	workerCustomerEntitlementSchema,
} from "../../models/subject/rows/workerCustomerEntitlement.js";
import type { WorkerCustomerPrice } from "../../models/subject/rows/workerCustomerPrice.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import type {
	WorkerFullCustomerEntitlement,
	WorkerFullCustomerPrice,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import { parseWorkerCustomerEntitlement } from "../../parsers.js";

const joinCustomerEntitlement = ({
	row,
	state,
	catalog,
}: {
	row: WorkerCustomerEntitlement;
	state: SubjectState;
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
		rollovers: state.rollovers.filter(
			(rollover) => rollover.cus_ent_id === row.id,
		),
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
	const join = (row: WorkerCustomerEntitlement) =>
		joinCustomerEntitlement({ row, state, catalog });
	const customer_products = state.customerProducts.map((customerProduct) => {
		const product = catalog.products[customerProduct.internal_product_id];
		if (!product)
			throw new CatalogRowMissingError({
				table: "products",
				id: customerProduct.internal_product_id,
			});
		return {
			...customerProduct,
			product,
			customer_prices: state.customerPrices
				.filter((row) => row.customer_product_id === customerProduct.id)
				.map((row) => joinCustomerPrice({ row, catalog })),
			customer_entitlements: state.customerEntitlements
				.filter((row) => row.customer_product_id === customerProduct.id)
				.map(join),
		};
	});
	const productIds = new Set(state.customerProducts.map((row) => row.id));
	const extra_customer_entitlements = state.customerEntitlements
		.filter(
			(row) =>
				row.customer_product_id === null ||
				!productIds.has(row.customer_product_id),
		)
		.map(join);

	return {
		identity: { ...state.identity, entityId },
		revision: state.revision,
		customer: state.customer,
		entity: entityId && state.entity?.id === entityId ? state.entity : null,
		customer_products,
		extra_customer_entitlements,
		usage_windows: state.usageWindows,
	};
};

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

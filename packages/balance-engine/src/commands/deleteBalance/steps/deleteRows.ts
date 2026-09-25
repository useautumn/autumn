import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../../models/subject/workerFullSubject.js";

/** Each grant with its rollovers, as Postgres cascades them. */
export const deleteRows = ({
	customerEntitlements,
}: {
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
}): RowChange[] =>
	customerEntitlements.flatMap(({ id, rollovers }): RowChange[] => [
		...rollovers.map(
			(rollover): RowChange => ({
				table: "rollovers",
				op: "delete",
				id: rollover.id,
			}),
		),
		{ table: "customerEntitlements", op: "delete", id },
	]);

/** A product that loses a grant is no longer its plan as sold; each is marked custom once. */
export const markProductsCustom = ({
	customerEntitlements,
}: {
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
}): RowChange[] => {
	const customerProducts = new Map(
		customerEntitlements.flatMap(({ customer_product }) =>
			customer_product && !customer_product.is_custom
				? [[customer_product.id, customer_product]]
				: [],
		),
	);
	return [...customerProducts.values()].map(
		(customerProduct): RowChange => ({
			table: "customerProducts",
			op: "update",
			id: customerProduct.id,
			before: { is_custom: customerProduct.is_custom },
			after: { is_custom: true },
		}),
	);
};

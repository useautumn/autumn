import type { MigrationItemChange } from "@autumn/shared";
import type { BatchMigrationChanges } from "../execute/types/batchMigrationChanges.js";

/** Groups an op's changes by customer in their persisted shape: definitions
 * and products are kept as ids and reloaded when the changes are published. */
export const toMigrationItemChanges = ({
	insertedItems = [],
	removedItems = [],
	repointedProducts = [],
	repointedPoolCustomerIds = [],
}: BatchMigrationChanges): Map<string, MigrationItemChange[]> => {
	const changesByCustomer = new Map<string, MigrationItemChange[]>();
	const add = (internalCustomerId: string, change: MigrationItemChange) => {
		const changes = changesByCustomer.get(internalCustomerId) ?? [];
		changes.push(change);
		changesByCustomer.set(internalCustomerId, changes);
	};

	for (const { internalCustomerId, ...item } of insertedItems)
		add(internalCustomerId, { kind: "entitlement_created", ...item });
	for (const { internalCustomerId, entitlement, ...item } of removedItems)
		add(internalCustomerId, {
			kind: "entitlement_deleted",
			entitlementId: entitlement.id,
			...item,
		});
	for (const {
		internalCustomerId,
		fromProduct,
		toProduct,
		...product
	} of repointedProducts)
		add(internalCustomerId, {
			kind: "customer_product_repointed",
			fromInternalProductId: fromProduct.internal_id,
			toInternalProductId: toProduct.internal_id,
			...product,
		});
	for (const internalCustomerId of repointedPoolCustomerIds)
		add(internalCustomerId, { kind: "license_pool_repointed" });

	return changesByCustomer;
};

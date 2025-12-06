import {
	customerEntitlements,
	customerProducts,
	customers,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { batchDeleteCachedCustomers } from "@/internal/customers/cusUtils/apiCusCacheUtils/batchDeleteCachedCustomers.js";

export interface ClearCreditSystemCachePayload {
	orgId: string;
	env: string;
	internalFeatureId: string;
}

const BATCH_SIZE = 50;

/**
 * Clears the cache for all customers who have an entitlement to a credit system feature.
 * This is used when the credit schema is updated to ensure customers get the new deduction rates.
 */
export const runClearCreditSystemCacheTask = async ({
	db,
	payload,
	logger,
}: {
	db: DrizzleCli;
	payload: ClearCreditSystemCachePayload;
	logger: { info: (msg: string) => void; error: (msg: string) => void };
}) => {
	const { orgId, env, internalFeatureId } = payload;

	logger.info(
		`Clearing cache for customers with credit system feature: ${internalFeatureId} (org: ${orgId}, env: ${env})`,
	);

	// Query for all customers with entitlements to this credit system
	// Join customer_entitlements with customer_products to filter by status
	const affectedCustomers = await db
		.selectDistinct({
			customerId: customers.id,
			internalCustomerId: customers.internal_id,
		})
		.from(customerEntitlements)
		.innerJoin(
			customerProducts,
			eq(customerEntitlements.customer_product_id, customerProducts.id),
		)
		.innerJoin(
			customers,
			eq(customerProducts.internal_customer_id, customers.internal_id),
		)
		.where(
			and(
				eq(customerEntitlements.internal_feature_id, internalFeatureId),
				inArray(customerProducts.status, RELEVANT_STATUSES),
			),
		);

	if (affectedCustomers.length === 0) {
		logger.info("No customers found with entitlements to this credit system");
		return;
	}

	logger.info(
		`Found ${affectedCustomers.length} customers with entitlements to this credit system`,
	);

	// Process in batches of BATCH_SIZE
	let totalDeleted = 0;
	for (let i = 0; i < affectedCustomers.length; i += BATCH_SIZE) {
		const batch = affectedCustomers.slice(i, i + BATCH_SIZE);

		const customersToDelete = batch
			.filter((c) => c.customerId !== null)
			.map((c) => ({
				orgId,
				env,
				customerId: c.customerId!,
			}));

		if (customersToDelete.length > 0) {
			const deleted = await batchDeleteCachedCustomers({
				customers: customersToDelete,
			});
			totalDeleted += deleted;
		}
	}

	logger.info(
		`Cleared ${totalDeleted} cache entries for ${affectedCustomers.length} customers`,
	);
};

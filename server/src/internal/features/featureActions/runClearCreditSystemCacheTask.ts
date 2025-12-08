import {
	customerEntitlements,
	customerProducts,
	customers,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import { and, asc, count, eq, gt, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { batchDeleteCachedCustomers } from "@/internal/customers/cusUtils/apiCusCacheUtils/batchDeleteCachedCustomers.js";
import type { Logger } from "../../../external/logtail/logtailUtils";

export interface ClearCreditSystemCachePayload {
	orgId: string;
	env: string;
	internalFeatureId: string;
}

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
	logger: Logger;
}) => {
	const { orgId, env, internalFeatureId } = payload;

	logger.info(
		`Clearing cache for customers with credit system feature: ${internalFeatureId}`,
	);

	// First get the total count to check if we should proceed
	const MAX_CUSTOMERS = 300000;
	const [countResult] = await db
		.select({ count: count() })
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
				eq(customers.org_id, orgId),
				eq(customers.env, env),
			),
		);

	const totalCount = countResult?.count ?? 0;
	logger.info(`Total customers to clear cache for: ${totalCount}`);

	if (totalCount > MAX_CUSTOMERS) {
		logger.error(
			`Cannot clear cache for ${totalCount} customers. Maximum allowed is ${MAX_CUSTOMERS}. Skipping cache clear.`,
		);
		return;
	}

	const PAGE_SIZE = 50000;
	let cursor: string | null = null;
	let page = 0;
	const allAffectedCustomers: {
		customerId: string;
		internalCustomerId: string;
	}[] = [];

	while (true) {
		const batch: { customerId: string | null; internalCustomerId: string }[] =
			await db
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
						eq(customers.org_id, orgId),
						eq(customers.env, env),
						cursor ? gt(customers.internal_id, cursor) : undefined,
					),
				)
				.orderBy(asc(customers.internal_id))
				.limit(PAGE_SIZE);

		const filteredBatch = batch.filter(
			(c): c is { customerId: string; internalCustomerId: string } =>
				c.customerId !== null,
		);
		allAffectedCustomers.push(...filteredBatch);
		page++;
		logger.info(`Fetched page ${page}: ${batch.length} customers`);

		if (batch.length < PAGE_SIZE) {
			break;
		}
		cursor = batch[batch.length - 1].internalCustomerId;
	}

	logger.info(`Total affected customers: ${allAffectedCustomers.length}`);

	// Process in batches of BATCH_SIZE
	const CACHE_BATCH_SIZE = 1000;
	let totalDeleted = 0;
	for (let i = 0; i < allAffectedCustomers.length; i += CACHE_BATCH_SIZE) {
		const batch = allAffectedCustomers.slice(i, i + CACHE_BATCH_SIZE);

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
		`Cleared ${totalDeleted} cache entries for ${allAffectedCustomers.length} customers`,
	);
};

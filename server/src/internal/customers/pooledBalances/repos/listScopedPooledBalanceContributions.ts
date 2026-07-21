import {
	customerEntitlements,
	customerProducts,
	pooledBalanceContributions,
} from "@autumn/shared";
import { and, desc, eq, getTableColumns, isNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

const POOLED_BALANCE_CONTRIBUTION_LIMIT = 100;

export const listScopedPooledBalanceContributions = async ({
	db,
	internalCustomerId,
	internalEntityId,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	/** Undefined means an entity was requested but could not be resolved. */
	internalEntityId: string | null | undefined;
}) => {
	if (internalEntityId === undefined) return [];

	return db
		.select(getTableColumns(pooledBalanceContributions))
		.from(pooledBalanceContributions)
		.innerJoin(
			customerEntitlements,
			eq(
				customerEntitlements.id,
				pooledBalanceContributions.source_customer_entitlement_id,
			),
		)
		.innerJoin(
			customerProducts,
			eq(
				customerProducts.id,
				pooledBalanceContributions.source_customer_product_id,
			),
		)
		.where(
			and(
				eq(customerProducts.internal_customer_id, internalCustomerId),
				eq(customerEntitlements.customer_product_id, customerProducts.id),
				internalEntityId === null
					? isNull(customerProducts.internal_entity_id)
					: eq(customerProducts.internal_entity_id, internalEntityId),
			),
		)
		.orderBy(desc(pooledBalanceContributions.created_at))
		.limit(POOLED_BALANCE_CONTRIBUTION_LIMIT);
};

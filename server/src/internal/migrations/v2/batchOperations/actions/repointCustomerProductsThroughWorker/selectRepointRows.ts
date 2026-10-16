import { CusProductStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	type OperationScope,
	operationScopeSql,
} from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import type { RepointedCustomerProductRow } from "../repointCustomerProductsForPage/repointCustomerProductRows.js";
import { customerPriceIdsSql } from "../utils/customerPriceIdsSql.js";
import { pageCustomerIdsCte } from "../utils/pageCustomerIdsSql.js";
import { productLoadedByWorkerSql } from "../utils/productLoadedByWorkerSql.js";

const RepointRowSchema = z.object({
	customer_product_id: z.string(),
	internal_customer_id: z.string(),
	entity_id: z.string().nullable(),
	internal_entity_id: z.string().nullable(),
	internal_product_id: z.string(),
	is_custom: z.boolean(),
	customer_price_ids: z.array(z.string()),
	status: z.enum(CusProductStatus),
	product_loaded_by_worker: z.boolean(),
	starts_at: z.coerce.number().nullable(),
	canceled_at: z.coerce.number().nullable(),
	ended_at: z.coerce.number().nullable(),
	trial_ends_at: z.coerce.number().nullable(),
});

export type RepointRow = RepointedCustomerProductRow & {
	internalProductId: string;
	productIsCustom: boolean;
	productLoadedByWorker: boolean;
	customerPriceIds: string[];
	ownerInternalEntityId: string | null;
	ownerEntityId: string | null;
};

export const selectRepointRows = async ({
	db,
	internalCustomerIds,
	scope,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
}): Promise<RepointRow[]> => {
	if (internalCustomerIds.length === 0) return [];
	const rows = await db.execute(sql`
		WITH ${pageCustomerIdsCte({ internalCustomerIds })}
		SELECT
			cp.id AS customer_product_id,
			cp.internal_customer_id,
			entity.id AS entity_id,
			cp.internal_entity_id,
			cp.internal_product_id,
			cp.is_custom,
			${customerPriceIdsSql} AS customer_price_ids,
			cp.status,
			${productLoadedByWorkerSql} AS product_loaded_by_worker,
			cp.starts_at,
			cp.canceled_at,
			cp.ended_at,
			cp.trial_ends_at
		FROM page
		INNER JOIN customer_products AS cp
			ON cp.internal_customer_id = page.internal_customer_id
		LEFT JOIN entities AS entity
			ON entity.internal_id = cp.internal_entity_id
		WHERE ${operationScopeSql({ scope })}
		ORDER BY cp.id
	`);

	return rows.map((row) => {
		const parsed = RepointRowSchema.parse(row);
		return {
			customerProductId: parsed.customer_product_id,
			internalCustomerId: parsed.internal_customer_id,
			entityId: parsed.entity_id,
			status: parsed.status,
			startsAt: parsed.starts_at,
			canceledAt: parsed.canceled_at,
			endedAt: parsed.ended_at,
			trialEndsAt: parsed.trial_ends_at,
			internalProductId: parsed.internal_product_id,
			productIsCustom: parsed.is_custom,
			productLoadedByWorker: parsed.product_loaded_by_worker,
			customerPriceIds: parsed.customer_price_ids,
			ownerInternalEntityId: parsed.internal_entity_id,
			ownerEntityId: parsed.entity_id,
		};
	});
};

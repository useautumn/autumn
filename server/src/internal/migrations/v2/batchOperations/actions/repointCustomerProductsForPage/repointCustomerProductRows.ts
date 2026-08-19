import { CusProductStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	type OperationScope,
	operationScopeSql,
} from "../../scope/operationScope.js";
import { pageCustomerIdsCte } from "../utils/pageCustomerIdsSql.js";

const RepointedCustomerProductRowSchema = z.object({
	customer_product_id: z.string(),
	internal_customer_id: z.string(),
	entity_id: z.string().nullable(),
	status: z.enum(CusProductStatus),
	starts_at: z.coerce.number().nullable(),
	canceled_at: z.coerce.number().nullable(),
	ended_at: z.coerce.number().nullable(),
	trial_ends_at: z.coerce.number().nullable(),
});

export type RepointedCustomerProductRow = {
	customerProductId: string;
	internalCustomerId: string;
	entityId: string | null;
	status: CusProductStatus;
	startsAt: number | null;
	canceledAt: number | null;
	endedAt: number | null;
	trialEndsAt: number | null;
};

export const repointCustomerProductRows = async ({
	db,
	internalCustomerIds,
	scope,
	toInternalProductId,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	toInternalProductId: string;
}): Promise<RepointedCustomerProductRow[]> => {
	const rows = await db.execute(sql`
		WITH ${pageCustomerIdsCte({ internalCustomerIds })},
		candidate_rows AS MATERIALIZED (
			SELECT
				cp.id AS customer_product_id,
				cp.internal_customer_id,
				entity.id AS entity_id,
				cp.status,
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
			FOR UPDATE OF cp
		),
		updated AS (
			UPDATE customer_products AS cp
			SET internal_product_id = ${toInternalProductId}
			FROM candidate_rows AS candidate
			WHERE cp.id = candidate.customer_product_id
			RETURNING cp.id
		)
		SELECT candidate.*
		FROM candidate_rows AS candidate
		INNER JOIN updated
			ON updated.id = candidate.customer_product_id
		ORDER BY candidate.customer_product_id
	`);

	return rows.map((row) => {
		const parsed = RepointedCustomerProductRowSchema.parse(row);
		return {
			customerProductId: parsed.customer_product_id,
			internalCustomerId: parsed.internal_customer_id,
			entityId: parsed.entity_id,
			status: parsed.status,
			startsAt: parsed.starts_at,
			canceledAt: parsed.canceled_at,
			endedAt: parsed.ended_at,
			trialEndsAt: parsed.trial_ends_at,
		};
	});
};

import {
	CusProductStatus,
	EntitlementSchema,
	type EntitlementWithFeature,
	type Feature,
} from "@autumn/shared";
import { enrichEntitlementsWithFeatures } from "@autumn/shared/utils/productUtils/entUtils/enrichEntitlement.js";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { pageCustomerIdsCte } from "@/internal/migrations/v2/batchOperations/actions/utils/pageCustomerIdsSql.js";
import { entitlementPriceFilterSql } from "@/internal/migrations/v2/batchOperations/actions/utils/resolveFilterEntitlementIds.js";
import { rowIsUnpaidSql } from "@/internal/migrations/v2/batchOperations/actions/utils/rowIsUnpaidSql.js";
import {
	type OperationScope,
	operationScopeSql,
} from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import type { EntitlementPriceFilter } from "@/internal/migrations/v2/batchOperations/types/entitlementPriceFilter.js";

export const nullableNumeric = z.preprocess(
	(value) => (value === null || value === undefined ? null : Number(value)),
	z.number().nullable(),
);

/** Shared projection for live unpaid rows matching a compiled filter. */
export const LiveFilterCandidateCoreSchema = z.object({
	customerEntitlementId: z.string(),
	customerProductId: z.string(),
	internalCustomerId: z.string(),
	entityId: z.string().nullable(),
	status: z.enum(CusProductStatus),
	startsAt: nullableNumeric,
	canceledAt: nullableNumeric,
	endedAt: nullableNumeric,
	trialEndsAt: nullableNumeric,
	liveBalance: nullableNumeric,
	liveNextResetAt: nullableNumeric,
	definition: EntitlementSchema,
});

export type LiveFilterCandidateCore = z.infer<
	typeof LiveFilterCandidateCoreSchema
>;

export type LiveFilterCandidateRow = Omit<
	LiveFilterCandidateCore,
	"definition"
> & {
	liveDefinition?: EntitlementWithFeature;
};

const liveFilterCandidateCoreSelectSql = sql`
	live.id AS "customerEntitlementId",
	cp.id AS "customerProductId",
	cp.internal_customer_id AS "internalCustomerId",
	entity.id AS "entityId",
	cp.status AS "status",
	cp.starts_at AS "startsAt",
	cp.canceled_at AS "canceledAt",
	cp.ended_at AS "endedAt",
	cp.trial_ends_at AS "trialEndsAt",
	live.balance AS "liveBalance",
	live.next_reset_at AS "liveNextResetAt",
	TO_JSONB(definition) AS definition
`;

const liveFilterCandidateFromSql = sql`
	FROM page
	INNER JOIN customer_products AS cp
		ON cp.internal_customer_id = page.internal_customer_id
	INNER JOIN customer_entitlements AS live
		ON live.customer_product_id = cp.id
	INNER JOIN entitlements AS definition
		ON definition.id = live.entitlement_id
	LEFT JOIN entities AS entity
		ON entity.internal_id = cp.internal_entity_id
`;

const liveFilterCandidateWhereSql = ({
	scope,
	filter,
}: {
	scope: OperationScope;
	filter: EntitlementPriceFilter;
}): SQL => sql`
	WHERE ${operationScopeSql({ scope })}
		AND ${rowIsUnpaidSql({
			customerProductId: sql`cp.id`,
			entitlementId: sql`live.entitlement_id`,
		})}
		${entitlementPriceFilterSql({ filter })}
`;

/** Live unpaid scoped rows matching a compiled filter, plus caller extras. */
export const buildLiveFilterCandidateQuery = ({
	internalCustomerIds,
	scope,
	filter,
	extraSelect = sql``,
	extraJoins = sql``,
	extraWhere = sql``,
	afterCustomerProductId,
	limit,
}: {
	internalCustomerIds: string[];
	scope: OperationScope;
	filter: EntitlementPriceFilter;
	extraSelect?: SQL;
	extraJoins?: SQL;
	extraWhere?: SQL;
	afterCustomerProductId?: string;
	limit: number;
}) => sql`
	WITH ${pageCustomerIdsCte({ internalCustomerIds })}
	SELECT
		${liveFilterCandidateCoreSelectSql}
		${extraSelect}
	${liveFilterCandidateFromSql}
	${extraJoins}
	${liveFilterCandidateWhereSql({ scope, filter })}
		${extraWhere}
		${afterCustomerProductId ? sql`AND cp.id > ${afterCustomerProductId}` : sql``}
	ORDER BY cp.id
	LIMIT ${limit}
`;

export const toLiveFilterCandidateRow = ({
	parsed,
	features,
}: {
	parsed: LiveFilterCandidateCore;
	features: Feature[];
}): LiveFilterCandidateRow => {
	const { definition, ...rest } = parsed;
	return {
		...rest,
		liveDefinition: enrichEntitlementsWithFeatures({
			entitlements: [definition],
			features,
		})[0],
	};
};

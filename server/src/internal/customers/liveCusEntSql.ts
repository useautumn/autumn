import { ACTIVE_STATUSES } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { looseEntitlementIsLiveSql } from "./looseEntitlementSql.js";

export const activeStatusList = (): SQL =>
	sql.join(
		ACTIVE_STATUSES.map((status) => sql`${status}`),
		sql`, `,
	);

/** Entity-scoped unlimited deductions land in entities[*].balance while the
 * top-level balance stays 0 — count both (mirrors cusEntsToUnlimitedUsage). */
export const unlimitedUsedSumSql = (): SQL => sql`SUM(
	-(COALESCE(ce.balance, 0) + CASE
		WHEN jsonb_typeof(ce.entities) = 'object' THEN COALESCE((
			SELECT SUM((ent.value->>'balance')::numeric)
			FROM jsonb_each(ce.entities) AS ent
		), 0)
		ELSE 0
	END)
) FILTER (WHERE ce.unlimited IS TRUE)`;

/** "Live" must match what the Usage column sums (cusEnts of ACTIVE_STATUSES
 * products + non-drained loose rows) — NOT `ce.expired`, whose NULL→true
 * backfill lags and leaves churned-product rows looking live. Requires `cp`
 * joined on ce.customer_product_id. */
export const liveCusEntPredicate = (): SQL => sql`
	(ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
	AND ce.pooled_contribution_id IS NULL
	AND (
		(ce.customer_product_id IS NULL AND ${looseEntitlementIsLiveSql()})
		OR cp.status IN (${activeStatusList()})
	)
`;

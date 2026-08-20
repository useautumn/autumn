import type { EntitlementWithFeature } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { CustomerEntitlementPatch } from "@/internal/billing/v2/actions/batchTransition/types/entitlementPriceOperationTypes.js";
import type { OperationScope } from "../../scope/operationScope.js";
import { operationScopeSql } from "../../scope/operationScope.js";
import type { EnrichedCycleCandidate } from "../../utils/enrichCustomerEntitlementCycles.js";
import { rowIsUnpaidSql } from "../utils/rowIsUnpaidSql.js";
import type { ReplaceCandidateRow } from "./selectReplaceCandidateRows.js";

const balanceAssignment = ({ patch }: { patch: CustomerEntitlementPatch }) => {
	const balance = patch.balance;
	if (!balance) return sql``;
	if (balance.type === "increment") {
		return sql`, balance = target.balance + ${balance.amount}`;
	}
	return sql`, balance = ${balance.amount}`;
};

export type ReplaceRow = ReplaceCandidateRow &
	Pick<EnrichedCycleCandidate, "resetCycleAnchor" | "nextResetAt">;

/** Writes the minted definition and resolved cycle onto already-selected rows,
 * re-asserting the patch scope so a row that drifted out never gets written. */
export const applyReplacePatches = async ({
	db,
	rows,
	scope,
	toEntitlement,
	customerEntitlementPatch,
}: {
	db: DrizzleCli;
	rows: ReplaceRow[];
	scope: OperationScope;
	toEntitlement: EntitlementWithFeature;
	customerEntitlementPatch: CustomerEntitlementPatch;
}): Promise<{
	rows: number;
	updatedIds: string[];
	internalCustomerIds: string[];
}> => {
	if (rows.length === 0)
		return { rows: 0, updatedIds: [], internalCustomerIds: [] };

	const unlimitedAssignment =
		customerEntitlementPatch.unlimited === undefined
			? sql``
			: sql`, unlimited = ${customerEntitlementPatch.unlimited}`;

	const serializedRows = JSON.stringify(
		rows.map((row) => ({
			id: row.customerEntitlementId,
			reset_cycle_anchor: row.resetCycleAnchor,
			next_reset_at: row.nextResetAt,
		})),
	);

	const updated = await db.execute<{
		id: string;
		internal_customer_id: string;
	}>(sql`
		WITH patched AS (
			SELECT *
			FROM JSONB_TO_RECORDSET(${serializedRows}::jsonb) AS r(
				id text,
				reset_cycle_anchor numeric,
				next_reset_at numeric
			)
		)
		UPDATE customer_entitlements AS target
		SET
			entitlement_id = ${toEntitlement.id},
			internal_feature_id = ${toEntitlement.internal_feature_id},
			feature_id = ${toEntitlement.feature.id},
			reset_cycle_anchor = patched.reset_cycle_anchor,
			next_reset_at = patched.next_reset_at,
			cache_version = COALESCE(target.cache_version, 0) + 1
			${balanceAssignment({ patch: customerEntitlementPatch })}
			${unlimitedAssignment}
		FROM patched
		INNER JOIN customer_products AS cp
			ON ${operationScopeSql({ scope })}
		WHERE target.id = patched.id
			AND cp.id = target.customer_product_id
			AND ${rowIsUnpaidSql({
				customerProductId: sql`cp.id`,
				entitlementId: sql`target.entitlement_id`,
			})}
		RETURNING target.id, cp.internal_customer_id
	`);

	return {
		rows: updated.length,
		updatedIds: updated.map((row) => row.id),
		internalCustomerIds: [
			...new Set(updated.map((row) => row.internal_customer_id)),
		],
	};
};

import {
	type BillingPlanOp,
	toBillingPlanIncrementOp,
	toBillingPlanUpdateOp,
} from "@autumn/balance-engine";
import type { WorkerMigrationPlan } from "@/internal/balanceWorker/migrationPlan/types/workerMigrationPlan.js";
import { entitlementCatalogRows } from "../throughWorker/entitlementCatalogRows.js";
import {
	expectedProductOf,
	ownerEntityIdsOf,
} from "../throughWorker/isHeldByWorker.js";
import type { ReplaceWorkerRow } from "./types/replaceWorkerRow.js";

const grantUpdateOf = ({ row }: { row: ReplaceWorkerRow }): BillingPlanOp => {
	const toEntitlement = row.replace.entitlement;
	const { balance, unlimited } = row.customerEntitlementPatch;
	return toBillingPlanUpdateOp({
		table: "customerEntitlements",
		id: row.customerEntitlementId,
		set: {
			entitlement_id: toEntitlement.id,
			internal_feature_id: toEntitlement.internal_feature_id,
			feature_id: toEntitlement.feature.id,
			reset_cycle_anchor: row.resetCycleAnchor,
			next_reset_at: row.nextResetAt,
			...(unlimited !== undefined ? { unlimited } : {}),
			...(balance?.type === "set" ? { balance: balance.amount } : {}),
		},
		expect: { entitlement_id: row.entitlementId },
		expectProduct: expectedProductOf({ row }),
	});
};

const balanceIncrementOf = ({
	row,
}: {
	row: ReplaceWorkerRow;
}): BillingPlanOp[] => {
	const { balance } = row.customerEntitlementPatch;
	if (balance?.type !== "increment" || balance.amount === 0) return [];
	return [
		toBillingPlanIncrementOp({
			id: row.customerEntitlementId,
			add: { balance: balance.amount },
		}),
	];
};

export const replaceRowsToMigrationPlan = ({
	rows,
}: {
	rows: ReplaceWorkerRow[];
}): WorkerMigrationPlan => ({
	entityIds: ownerEntityIdsOf({ rows }),
	ops: rows.flatMap((row) => [
		grantUpdateOf({ row }),
		...balanceIncrementOf({ row }),
	]),
	catalogRows: entitlementCatalogRows({
		entitlements: rows.map(({ replace }) => replace.entitlement),
	}),
});

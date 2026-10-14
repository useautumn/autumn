import { toBillingPlanDeleteOp } from "@autumn/balance-engine";
import type { WorkerMigrationPlan } from "@/internal/balanceWorker/migrationPlan/types/workerMigrationPlan.js";
import type { RemoveCandidateRow } from "../removeCustomerEntitlementsForPage/selectRemoveCandidateRows.js";
import {
	expectedProductOf,
	ownerEntityIdsOf,
} from "../throughWorker/isHeldByWorker.js";

const uniqueByGrant = <Row extends { customerEntitlementId: string }>({
	rows,
}: {
	rows: Row[];
}): Row[] => [
	...new Map(rows.map((row) => [row.customerEntitlementId, row])).values(),
];

export const removeCandidatesToMigrationPlan = ({
	rows,
}: {
	rows: RemoveCandidateRow[];
}): WorkerMigrationPlan => {
	const grants = uniqueByGrant({ rows });
	return {
		entityIds: ownerEntityIdsOf({ rows: grants }),
		ops: grants.map((row) =>
			toBillingPlanDeleteOp({
				table: "customerEntitlements",
				id: row.customerEntitlementId,
				expect: { entitlement_id: row.entitlementId },
				expectProduct: expectedProductOf({ row }),
				withoutRollovers: true,
			}),
		),
		catalogRows: [],
	};
};

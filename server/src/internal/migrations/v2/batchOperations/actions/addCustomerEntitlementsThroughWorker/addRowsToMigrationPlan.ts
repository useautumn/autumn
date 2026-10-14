import { toBillingPlanInsertOp } from "@autumn/balance-engine";
import { CusProductStatus } from "@autumn/shared";
import type { WorkerMigrationPlan } from "@/internal/balanceWorker/migrationPlan/types/workerMigrationPlan.js";
import { entitlementCatalogRows } from "../throughWorker/entitlementCatalogRows.js";
import {
	expectedProductOf,
	ownerEntityIdsOf,
} from "../throughWorker/isHeldByWorker.js";
import type { AddWorkerRow } from "./types/addWorkerRow.js";

export const addRowToGrant = ({
	row,
	now,
}: {
	row: AddWorkerRow;
	now: number;
}) => {
	const { entitlement, initialState, invoiceCredit } = row.add;
	return {
		id: row.id,
		customer_product_id: row.customerProductId,
		entitlement_id: entitlement.id,
		internal_customer_id: row.internalCustomerId,
		internal_entity_id: null,
		internal_feature_id: entitlement.internal_feature_id,
		unlimited: initialState.unlimited,
		balance: initialState.granted,
		created_at: now,
		reset_cycle_anchor: row.resetCycleAnchor,
		next_reset_at: row.nextResetAt,
		usage_allowed: false,
		separate_interval: false,
		adjustment: 0,
		additional_balance: 0,
		entities: null,
		expires_at: null,
		customer_id: row.customerId,
		feature_id: entitlement.feature.id,
		external_id: null,
		invoice_credit: invoiceCredit ?? false,
		expired: row.status === CusProductStatus.Expired,
	};
};

const featureKeyOf = ({ row }: { row: AddWorkerRow }) =>
	`${row.customerProductId}|${row.add.entitlement.internal_feature_id}`;

export const addRowsToMigrationPlan = ({
	rows,
	now,
}: {
	rows: AddWorkerRow[];
	now: number;
}): WorkerMigrationPlan => {
	const insertedByFeature = new Map<string, Record<string, string>>();
	const ops = rows.map((row) => {
		const key = featureKeyOf({ row });
		const insertedEarlier = insertedByFeature.get(key) ?? {};
		insertedByFeature.set(key, {
			...insertedEarlier,
			[row.id]: row.add.entitlement.id,
		});
		return toBillingPlanInsertOp({
			table: "customerEntitlements",
			row: addRowToGrant({ row, now }),
			expectFeatureGrants: { ...row.featureGrants, ...insertedEarlier },
			expectProduct: expectedProductOf({ row }),
		});
	});
	return {
		entityIds: ownerEntityIdsOf({ rows }),
		ops,
		catalogRows: entitlementCatalogRows({
			entitlements: rows.map(({ add }) => add.entitlement),
		}),
	};
};

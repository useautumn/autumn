import type { BillingPlanOp, CatalogRow } from "@autumn/balance-engine";

export type WorkerMigrationPlan = {
	entityIds: string[];
	ops: BillingPlanOp[];
	catalogRows: CatalogRow[];
};

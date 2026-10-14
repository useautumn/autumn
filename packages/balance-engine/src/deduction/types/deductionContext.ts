import type { UsageWindowLimit } from "@autumn/shared";
import type { AllocationGate } from "../../allocations/resolveAllocationGate.js";
import type { WorkerRollover } from "../../models/subject/rows/workerRollover.js";
import type { WorkerUsageWindow } from "../../models/subject/rows/workerUsageWindow.js";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../models/subject/workerFullSubject.js";
import type { DeductionSelection } from "./deductionRequest.js";
import type { DeductionRow } from "./deductionRow.js";

export type DeductionContext = {
	selection: DeductionSelection;
	entityId: string | null;
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
	rollovers: WorkerRollover[];
	rows: DeductionRow[];
	rolloverRows: DeductionRow[];
	spendLimitByFeatureId: Record<string, number>;
	usageWindowLimits: UsageWindowLimit[];
	usageWindows: WorkerUsageWindow[];
	allocationGates: Map<string, AllocationGate>;
	overdueBlocked: boolean;
};

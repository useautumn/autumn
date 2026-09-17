import type { OverageBehavior } from "../../commands/track/types/trackCommand.js";
import type { WorkerRollover } from "../../models/subject/rows/workerRollover.js";
import type { WorkerFullCustomerEntitlement } from "../../models/subject/workerFullSubject.js";
import type { DeductionRow } from "./deductionRow.js";

/** Everything a deduction needs, decided once from the subject; the buckets never read the subject. */
export type DeductionContext = {
	featureId: string;
	entityId: string | null;
	now: number;
	overageBehavior: OverageBehavior;
	/** The selected entitlements in draw order; an unlimited one, if any, is first. */
	customerEntitlements: WorkerFullCustomerEntitlement[];
	/** Their rollovers, soonest-expiring first. */
	rollovers: WorkerRollover[];
	/** One per customer entitlement, same order. */
	rows: DeductionRow[];
	/** One per rollover, same order. */
	rolloverRows: DeductionRow[];
};

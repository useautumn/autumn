import type { UsageWindowLimit } from "@autumn/shared";
import type { WorkerRollover } from "../../models/subject/rows/workerRollover.js";
import type { WorkerUsageWindow } from "../../models/subject/rows/workerUsageWindow.js";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../models/subject/workerFullSubject.js";
import type { DeductionSelection } from "./deductionRequest.js";
import type { DeductionRow } from "./deductionRow.js";

/** The rows a selection found on the subject, bounded and ready to draw from; the buckets never read the subject. */
export type DeductionContext = {
	/** What selected these rows; a request with the same selection draws from this context. */
	selection: DeductionSelection;
	entityId: string | null;
	/** The selected entitlements in draw order; an unlimited one, if any, is first. */
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
	/** Their rollovers, soonest-expiring first. */
	rollovers: WorkerRollover[];
	/** One per customer entitlement, same order. */
	rows: DeductionRow[];
	/** One per rollover, same order. */
	rolloverRows: DeductionRow[];
	/** Absolute overage each feature may carry, resolved from the customer's and plans' spend limits. */
	spendLimitByFeatureId: Record<string, number>;
	/** The windowed caps this track must respect; empty when an unlimited row funds it or the caller overflows. */
	usageWindowLimits: UsageWindowLimit[];
	/** The subject's counter rows as they stand; the caps read them and the outcome re-stamps them. */
	usageWindows: WorkerUsageWindow[];
	/** Past-due products were dropped from the selection; with no rows left, the value is refused, not unsupported. */
	overdueBlocked: boolean;
};

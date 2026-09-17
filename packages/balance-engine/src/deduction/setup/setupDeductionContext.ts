import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import type { DeductionContext } from "../types/deductionContext.js";
import type { DeductionRequest } from "../types/deductionRequest.js";
import { resolveBillingControls } from "./resolveBillingControls.js";
import { resolveCreditCost } from "./resolveCreditCosts.js";
import {
	customerEntitlementToDeductionRow,
	rolloverToDeductionRow,
} from "./resolveRowBounds.js";
import { resolveUsageWindowLimits } from "./resolveUsageWindowLimits.js";
import { selectDeductionRows } from "./selectDeductionRows.js";

/** Everything a deduction needs, decided once; the buckets never read the subject. */
export const setupDeductionContext = ({
	fullSubject,
	request,
}: {
	fullSubject: WorkerFullSubject;
	request: DeductionRequest;
}): DeductionContext => {
	const { customerEntitlements, rollovers, overdueBlocked } =
		selectDeductionRows({ fullSubject, request });
	const { spendLimitByFeatureId, overageAllowedByFeatureId } =
		resolveBillingControls({
			fullSubject,
			featureId: request.featureId,
			customerEntitlements,
		});
	const usageWindowLimits = resolveUsageWindowLimits({
		fullSubject,
		request,
		customerEntitlements,
	});
	// A control that enables overage only lifts features with no natively overage-allowed row.
	const nativeOverageFeatureIds = new Set(
		customerEntitlements
			.filter((customerEntitlement) => customerEntitlement.usage_allowed)
			.map((customerEntitlement) => customerEntitlement.entitlement.feature.id),
	);
	const rows = customerEntitlements.map((customerEntitlement) =>
		customerEntitlementToDeductionRow({
			customerEntitlement,
			creditCost: resolveCreditCost({ customerEntitlement, request }),
			overageAllowedByFeatureId,
			nativeOverageFeatureIds,
			overageBehavior: request.overageBehavior,
		}),
	);
	const rowById = new Map(rows.map((row) => [row.id, row]));

	return {
		featureId: request.featureId,
		entityId: fullSubject.entity?.id ?? null,
		now: request.now,
		overageBehavior: request.overageBehavior,
		customerEntitlements,
		rollovers,
		rows,
		rolloverRows: rollovers.flatMap((rollover) => {
			const owner = rowById.get(rollover.cus_ent_id);
			return owner ? [rolloverToDeductionRow({ rollover, owner })] : [];
		}),
		spendLimitByFeatureId,
		usageWindowLimits,
		usageWindows: fullSubject.usage_windows,
		overdueBlocked,
	};
};

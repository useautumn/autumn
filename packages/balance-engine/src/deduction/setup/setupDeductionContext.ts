import { resolveAllocationGates } from "../../allocations/resolveAllocationGate.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import type { DeductionContext } from "../types/deductionContext.js";
import type { DeductionSelection } from "../types/deductionRequest.js";
import { resolveBillingControls } from "./resolveBillingControls.js";
import { resolveCreditCost } from "./resolveCreditCosts.js";
import {
	customerEntitlementToDeductionRows,
	rolloverToDeductionRow,
} from "./resolveRowBounds.js";
import { resolveUsageWindowLimits } from "./resolveUsageWindowLimits.js";
import { selectDeductionRows } from "./selectDeductionRows.js";

/** The selection's rows, bounded, decided once; the buckets never read the subject. */
export const setupDeductionContext = ({
	fullSubject,
	selection,
}: {
	fullSubject: WorkerFullSubject;
	selection: DeductionSelection;
}): DeductionContext => {
	const { customerEntitlements, rollovers, overdueBlocked } =
		selectDeductionRows({ fullSubject, selection });
	const { spendLimitByFeatureId, overageAllowedByFeatureId } =
		resolveBillingControls({
			fullSubject,
			featureId: selection.featureId,
			customerEntitlements,
		});
	const { usageWindowLimits, filtersByProperties } = resolveUsageWindowLimits({
		fullSubject,
		selection,
		customerEntitlements,
	});
	// A control that enables overage only lifts features with no natively overage-allowed row.
	const nativeOverageFeatureIds = new Set(
		customerEntitlements
			.filter((customerEntitlement) => customerEntitlement.usage_allowed)
			.map((customerEntitlement) => customerEntitlement.entitlement.feature.id),
	);
	const entityId = fullSubject.entity?.id ?? null;
	const creditCosts = customerEntitlements.map((customerEntitlement) =>
		resolveCreditCost({ customerEntitlement, selection }),
	);
	const rows = customerEntitlements.flatMap((customerEntitlement, index) => {
		const creditCost = creditCosts[index];
		if (!creditCost) return [];
		return customerEntitlementToDeductionRows({
			customerEntitlement,
			entityId,
			creditCost,
			overageAllowedByFeatureId,
			nativeOverageFeatureIds,
		});
	});
	const ownersOf = (customerEntitlementId: string) =>
		rows.filter(
			(row) => row.id === customerEntitlementId && !row.skipsRollovers,
		);

	return {
		selection,
		entityId,
		customerEntitlements,
		rollovers,
		rows,
		rolloverRows: rollovers.flatMap((rollover) =>
			ownersOf(rollover.cus_ent_id).map((owner) =>
				rolloverToDeductionRow({ rollover, owner }),
			),
		),
		spendLimitByFeatureId,
		usageWindowLimits,
		usageWindows: fullSubject.usage_windows,
		allocationGates:
			selection.countsAllocations && selection.countsUsageWindows
				? resolveAllocationGates({
						fullSubject,
						selection,
						customerEntitlements,
						rows,
					})
				: new Map(),
		overdueBlocked,
		readsProperties:
			filtersByProperties ||
			creditCosts.some(
				(creditCost) =>
					creditCost.readsProperties || creditCost.rateCard !== null,
			),
	};
};

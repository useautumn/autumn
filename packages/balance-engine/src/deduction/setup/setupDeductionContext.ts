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
	const usageWindowLimits = resolveUsageWindowLimits({
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
	const rows = customerEntitlements.flatMap((customerEntitlement) =>
		customerEntitlementToDeductionRows({
			customerEntitlement,
			entityId,
			creditCost: resolveCreditCost({ customerEntitlement, selection }),
			overageAllowedByFeatureId,
			nativeOverageFeatureIds,
		}),
	);
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
		overdueBlocked,
	};
};

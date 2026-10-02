import type { CatalogMigration, UpdatePlanOp } from "@autumn/shared";
import { buildMigrationDraftId } from "./buildMigrationDraftId";
import { buildMigrationPlanFilter } from "./buildMigrationPlanFilter";
import {
	sortTargetsByPlanVersion,
	stampPreviousPrice,
} from "./buildMigrationDraftUtils";
import { groupTargetsByCustomize } from "./groupTargetsByCustomize";
import { targetsToPlans } from "./targetsToPlans";
import type { MigrationTarget } from "./types";

/** Pure: MigrationTarget[] → one catalog migration draft, or null. */
export const buildMigrationDraft = ({
	targets,
	versionsWithCustomersByPlanId,
}: {
	targets: MigrationTarget[];
	versionsWithCustomersByPlanId: Record<string, number[]>;
}): CatalogMigration | null => {
	// Upsert rows arrive latest-version-first; buckets inherit the order of
	// their first target, so sorting up front yields (planId, version) op order.
	const orderedTargets = sortTargetsByPlanVersion({ targets });
	const buckets = groupTargetsByCustomize({ targets: orderedTargets });
	if (buckets.length === 0) return null;

	const operations: UpdatePlanOp[] = buckets.map(
		({ customize, targets: bucketTargets }) => ({
			type: "update_plan",
			plan_filter: buildMigrationPlanFilter({
				targets: bucketTargets,
				includeCustom: bucketTargets.every((target) => target.includeCustom),
				versionsWithCustomersByPlanId,
			}),
			customize: stampPreviousPrice({ customize, targets: bucketTargets }),
		}),
	);

	// Omit outer custom:false when any target includes custom — mixed guards
	// live on the ops; custom cannot sit inside a $or branch.
	const planFilter = buildMigrationPlanFilter({
		targets,
		includeCustom: targets.some((target) => target.includeCustom),
		versionsWithCustomersByPlanId,
	});

	return {
		id: buildMigrationDraftId({ planFilter }),
		plans: targetsToPlans({ targets }),
		include_custom: targets.some((target) => target.includeCustom),
		filter: { customer: { plan: planFilter } },
		operations: { customer: operations },
		no_billing_changes: !targets.some((target) => target.hasBillingChanges),
	};
};

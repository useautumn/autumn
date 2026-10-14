import type { CatalogMigration, UpdatePlanOp } from "@autumn/shared";
import { buildMigrationDraftId } from "./buildMigrationDraftId";
import { buildMigrationPlanFilter } from "./buildMigrationPlanFilter";
import {
	sortTargetsByPlanVersion,
	stampPreviousFeatureOverrides,
	stampPreviousPrice,
} from "./buildMigrationDraftUtils";
import { groupTargetsByCustomize } from "./groupTargetsByCustomize";
import { targetsToPlans } from "./targetsToPlans";
import type { MigrationTarget } from "./types";

export const buildMigrationDraft = ({
	targets,
	versionsWithCustomersByPlanId,
}: {
	targets: MigrationTarget[];
	versionsWithCustomersByPlanId: Record<string, number[]>;
}): CatalogMigration | null => {
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
			customize: stampPreviousFeatureOverrides({
				customize: stampPreviousPrice({ customize, targets: bucketTargets }),
				previousItemSets: bucketTargets.map(
					(target) => target.previousItems ?? [],
				),
			}),
		}),
	);

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

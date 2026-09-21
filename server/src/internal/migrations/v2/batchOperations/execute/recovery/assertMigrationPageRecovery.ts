import type { BatchMigrationExecutionPlan } from "../../types/index.js";
import type { MigrationPageRecovery } from "./types/migrationPageRecovery.js";

export const assertMigrationPageRecovery = ({
	plan,
	recovery,
}: {
	plan: BatchMigrationExecutionPlan;
	recovery?: MigrationPageRecovery;
}): void => {
	if (!recovery) return;

	const hasPageId = recovery.pageId.trim().length > 0;
	const hasValidTimestamp = Number.isFinite(recovery.effectiveAt);
	if (!hasPageId || !hasValidTimestamp)
		throw new Error(
			"Migration recovery requires a page ID and valid timestamp",
		);

	for (const patch of plan.patches) {
		const unsupportedOperationCount =
			patch.removeEntitlementOps.length +
			patch.replaceEntitlementOps.length +
			patch.licenseEntitlementOps.length;
		if (unsupportedOperationCount > 0)
			throw new Error(
				"Migration page recovery supports only add and repoint operations",
			);
	}
};

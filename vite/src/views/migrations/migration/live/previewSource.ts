import type { MigrationStatus } from "@autumn/shared";
import type { ExecutionStatus } from "./ExecutionStatusSubMenu";

export type MigrationPreviewSource = "filter" | "item_runs";

/** Until a Run All has executed the list is the live filter; afterwards it is
 * frozen to the customers the migration actually claimed. */
export function previewSourceForStatus(
	status: MigrationStatus,
): MigrationPreviewSource {
	return status === "draft" ? "filter" : "item_runs";
}

const FILTER_ONLY_STATUSES: ExecutionStatus[] = ["queued", "not_run"];

export function executionStatusOptionsForSource(
	source: MigrationPreviewSource,
	all: readonly ExecutionStatus[],
): ExecutionStatus[] {
	if (source === "filter") return [...all];
	return all.filter((status) => !FILTER_ONLY_STATUSES.includes(status));
}

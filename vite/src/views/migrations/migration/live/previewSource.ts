import type { MigrationStatus } from "@autumn/shared";
import type { MigrationPreviewSource } from "@/hooks/queries/useMigrationFilterPreview";
import type { ExecutionStatus } from "./ExecutionStatusSubMenu";

/** A queued or executing run processes the live filter, so the table keeps
 * showing it; the frozen list takes over once a Run All has completed. */
export function previewSourceForStatus(
	status: MigrationStatus,
): MigrationPreviewSource {
	return status === "draft" || status === "waiting" || status === "running"
		? "filter"
		: "item_runs";
}

/** Statuses only the live filter can answer (the frozen list has no unclaimed rows). */
const FILTER_ONLY_STATUSES: ExecutionStatus[] = ["queued", "not_run"];

export function executionStatusesForSource(
	source: MigrationPreviewSource,
	statuses: readonly ExecutionStatus[],
): ExecutionStatus[] {
	if (source === "filter") return [...statuses];
	return statuses.filter((status) => !FILTER_ONLY_STATUSES.includes(status));
}

import type { MigrationStatus } from "@autumn/shared";
import type { MigrationPreviewSource } from "@/hooks/queries/useMigrationFilterPreview";
import type { ExecutionStatus } from "./ExecutionStatusSubMenu";

export function previewSourceForStatus(
	status: MigrationStatus,
): MigrationPreviewSource {
	return status === "draft" || status === "waiting" || status === "running"
		? "filter"
		: "item_runs";
}

const FILTER_ONLY_STATUSES: ExecutionStatus[] = ["queued", "not_run"];

export function executionStatusesForSource(
	source: MigrationPreviewSource,
	statuses: readonly ExecutionStatus[],
): ExecutionStatus[] {
	if (source === "filter") return [...statuses];
	return statuses.filter((status) => !FILTER_ONLY_STATUSES.includes(status));
}

import type { MigrationRunStatus } from "@autumn/shared";
import { Badge } from "@/components/v2/badges/Badge";
import type { MigrationItemEventStatus } from "@/hooks/queries/useMigrationRunsQuery";

const RUN_STATUS_STYLES: Record<MigrationRunStatus, string> = {
	queued: "bg-muted text-t2 border-transparent",
	running: "bg-muted text-t2 border-transparent animate-pulse",
	succeeded: "bg-green-500/10 text-green-500 border-transparent",
	failed: "bg-red-500/10 text-red-500 border-transparent",
};

const RUN_STATUS_LABELS: Record<MigrationRunStatus, string> = {
	queued: "Queued",
	running: "Running",
	succeeded: "Succeeded",
	failed: "Failed",
};

const ITEM_STATUS_STYLES: Record<MigrationItemEventStatus, string> = {
	succeeded: "bg-green-500/10 text-green-500 border-transparent",
	skipped: "bg-muted text-t2 border-transparent",
	failed: "bg-red-500/10 text-red-500 border-transparent",
};

const ITEM_STATUS_LABELS: Record<MigrationItemEventStatus, string> = {
	succeeded: "Succeeded",
	skipped: "Skipped",
	failed: "Failed",
};

export function RunStatusBadge({ status }: { status: MigrationRunStatus }) {
	return (
		<Badge className={RUN_STATUS_STYLES[status]}>
			{RUN_STATUS_LABELS[status]}
		</Badge>
	);
}

export function ItemEventStatusBadge({
	status,
}: {
	status: MigrationItemEventStatus;
}) {
	return (
		<Badge className={ITEM_STATUS_STYLES[status]}>
			{ITEM_STATUS_LABELS[status]}
		</Badge>
	);
}

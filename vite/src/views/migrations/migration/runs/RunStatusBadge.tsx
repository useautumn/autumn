import { format } from "date-fns";
import { Badge } from "@/components/v2/badges/Badge";
import type { MigrationItemEventStatus } from "@/hooks/queries/useMigrationRunsQuery";
import { cn } from "@/lib/utils";

export function ActiveRunDot({ className }: { className?: string }) {
	return (
		<span className={cn("relative flex h-2.5 w-2.5 shrink-0", className)}>
			<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
			<span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
		</span>
	);
}

const LIVE_STYLES: Record<MigrationItemEventStatus, string> = {
	succeeded: "bg-green-500/10 text-green-500 border-transparent",
	skipped: "bg-muted text-muted-foreground border-transparent",
	failed: "bg-red-500/10 text-red-500 border-transparent",
};

const DRY_STYLES: Record<MigrationItemEventStatus, string> = {
	succeeded: "bg-blue-500/10 text-blue-500 border-blue-500/30 border-dashed",
	skipped: "bg-muted text-muted-foreground border-border border-dashed",
	failed: "bg-orange-500/10 text-orange-500 border-orange-500/30 border-dashed",
};

const STATUS_LABELS: Record<MigrationItemEventStatus, string> = {
	succeeded: "Passed",
	skipped: "Skipped",
	failed: "Failed",
};

function isNoOpResponse(response: Record<string, unknown> | null): boolean {
	if (!response) return false;
	const preview = response.preview as
		| {
				plan_changes?: unknown[];
				balance_changes?: unknown[];
				flag_changes?: unknown[];
		  }
		| undefined;
	if (!preview) return false;
	return (
		(preview.plan_changes?.length ?? 0) === 0 &&
		(preview.balance_changes?.length ?? 0) === 0 &&
		(preview.flag_changes?.length ?? 0) === 0
	);
}

export function ItemEventStatusBadge({
	status,
	dryRun = false,
	response = null,
	timestamp,
}: {
	status: MigrationItemEventStatus;
	dryRun?: boolean;
	response?: Record<string, unknown> | null;
	timestamp?: string;
}) {
	if (status === "skipped" && isNoOpResponse(response))
		return (
			<Badge
				variant="muted"
				className={cn(
					"bg-muted text-tertiary-foreground",
					dryRun ? "border-border border-dashed" : "border-transparent",
				)}
			>
				No Changes
			</Badge>
		);

	const label =
		status === "succeeded" && timestamp
			? `${STATUS_LABELS[status]} (${format(new Date(timestamp), "d MMM yyyy")})`
			: STATUS_LABELS[status];

	return (
		<Badge
			variant="muted"
			className={(dryRun ? DRY_STYLES : LIVE_STYLES)[status]}
		>
			{label}
		</Badge>
	);
}

import { Skeleton } from "@autumn/ui";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
} from "@/components/general/table";
import { useCusRequestLogsQuery } from "@/hooks/queries/useCusRequestLogsQuery";
import { useWorkbenchStore } from "@/hooks/stores/useWorkbenchStore";
import { cn } from "@/lib/utils";
import { WorkbenchEmptyState } from "./WorkbenchEmptyState";
import { WorkbenchLogRow } from "./WorkbenchLogRow";
import { groupLogsByDay } from "./workbenchUtils";

const LoadingSkeleton = () => (
	<div>
		{Array.from({ length: 12 }).map((_, i) => (
			<div
				key={i}
				className="flex h-7 items-center px-3 border-b border-table-row-divider last:border-b-0"
			>
				<Skeleton
					className="h-2.5 w-full"
					style={{ animationDelay: `${i * 40}ms` }}
				/>
			</div>
		))}
	</div>
);

export const WorkbenchLogList = ({
	customerId,
	isOpen,
}: {
	customerId: string | undefined;
	isOpen: boolean;
}) => {
	const selectedLogId = useWorkbenchStore((s) => s.selectedLogId);
	const setSelectedLogId = useWorkbenchStore((s) => s.setSelectedLogId);

	const { logs, unconfigured, isLoading, isFetching, error } =
		useCusRequestLogsQuery({ customerId, enabled: isOpen });

	const hasData = logs.length > 0;
	const groups = groupLogsByDay(logs);

	const renderContent = () => {
		if (isLoading && !hasData) return <LoadingSkeleton />;
		if (error) {
			return (
				<WorkbenchEmptyState title="Failed to load logs">
					Check the server logs or your Axiom configuration.
				</WorkbenchEmptyState>
			);
		}
		if (unconfigured) {
			return (
				<WorkbenchEmptyState title="Axiom not configured">
					Set <code className="text-muted-foreground">AXIOM_ADMIN_TOKEN</code>{" "}
					on the server to enable the workbench.
				</WorkbenchEmptyState>
			);
		}
		if (!hasData) {
			return (
				<WorkbenchEmptyState title="No requests found">
					No API requests for this customer in the last 7 days.
				</WorkbenchEmptyState>
			);
		}
		return groups.map((group) => (
			<div
				key={group.label}
				className="border-b border-table-row-divider last:border-b-0"
			>
				<div className="px-3 py-1 text-[10px] uppercase tracking-wide font-semibold text-subtle bg-table-tray border-b border-table-row-divider sticky top-0 z-10">
					{group.label}
				</div>
				{group.entries.map((log) => (
					<WorkbenchLogRow
						key={log.id}
						log={log}
						selected={selectedLogId === log.id}
						onSelect={() => setSelectedLogId(log.id)}
					/>
				))}
			</div>
		));
	};

	return (
		<div className="flex flex-col min-h-0 flex-1 overflow-hidden">
			<div className="h-0.5 shrink-0">
				{isFetching && (
					<div className="h-full w-full bg-blue-500/40 animate-pulse" />
				)}
			</div>
			<div className={cn(TABLE_TRAY_CLASS, "m-2 flex flex-1 min-h-0 flex-col")}>
				<div
					className={cn(
						TABLE_TRAY_SURFACE_CLASS,
						"flex flex-1 min-h-0 flex-col",
					)}
				>
					<div className="flex-1 min-h-0 overflow-y-auto">
						{renderContent()}
					</div>
				</div>
			</div>
		</div>
	);
};

import { useCusRequestLogsQuery } from "@/hooks/queries/useCusRequestLogsQuery";
import { useWorkbenchStore } from "@/hooks/stores/useWorkbenchStore";
import { WorkbenchEmptyState } from "./WorkbenchEmptyState";
import { WorkbenchLogRow } from "./WorkbenchLogRow";
import { groupLogsByDay } from "./workbenchUtils";

const LoadingSkeleton = () => (
	<div className="p-3 space-y-1.5">
		{Array.from({ length: 12 }).map((_, i) => (
			<div
				key={i}
				className="h-7 bg-stone-100 dark:bg-stone-800/40 rounded animate-pulse"
				style={{ animationDelay: `${i * 40}ms` }}
			/>
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
			<div key={group.label}>
				<div className="px-3 py-1 text-[10px] uppercase tracking-wide font-semibold text-subtle bg-stone-50 dark:bg-stone-900/50 border-b border-border/40 sticky top-0 z-10">
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
			<div className="flex-1 min-h-0 overflow-y-auto">{renderContent()}</div>
		</div>
	);
};

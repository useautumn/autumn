import type { RequestLogEntry } from "@/hooks/queries/useCusRequestLogsQuery";
import { cn } from "@/lib/utils";
import {
	formatLogTime,
	methodColorClass,
	statusBadgeClass,
} from "./workbenchUtils";

export const WorkbenchLogRow = ({
	log,
	selected,
	onSelect,
}: {
	log: RequestLogEntry;
	selected: boolean;
	onSelect: () => void;
}) => (
	<button
		type="button"
		onClick={onSelect}
		className={cn(
			"w-full flex items-center gap-2.5 px-3 py-1.5 text-xs border-b border-border/40 hover:bg-stone-50 dark:hover:bg-stone-800/30 transition-colors text-left cursor-pointer",
			selected &&
				"bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-50 dark:hover:bg-blue-950/30",
		)}
	>
		<span
			className={cn(
				"shrink-0 px-1.5 py-0 rounded text-[10px] font-medium border tabular-nums",
				statusBadgeClass(log.statusCode),
			)}
		>
			{log.statusCode}
		</span>
		<span
			className={cn(
				"shrink-0 font-mono font-semibold text-[11px] w-11",
				methodColorClass(log.method),
			)}
		>
			{log.method ?? "—"}
		</span>
		<span className="flex-1 font-mono text-foreground text-[11px] truncate">
			{log.path ?? "(unknown)"}
		</span>
		<span className="shrink-0 font-mono text-subtle text-[10px] tabular-nums">
			{formatLogTime(log.time)}
		</span>
	</button>
);

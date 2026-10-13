import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import { AtomStatusChip } from "./AtomStatusChip";
import type { AtomChipDisplay } from "./atomDisplay";

export type AtomStageRow = {
	key: string;
	label: string;
	detail: string;
	chip: AtomChipDisplay;
	/** Steps not reached yet read quieter than the ones under way or done. */
	isReached: boolean;
};

/** Each step Atom goes through, what it stands up, and where it is. */
export const AtomStageTable = ({ rows }: { rows: AtomStageRow[] }) => (
	<ul className="border-t border-table-row-divider">
		{rows.map((row) => (
			<li
				key={row.key}
				className={cn(
					TABLE_TRAY_SURFACE_DIVIDER_CLASS,
					"grid h-9 grid-cols-[144px_minmax(0,1fr)_auto] items-center gap-4 px-4 text-sm",
					!row.isReached && "text-tertiary-foreground",
				)}
			>
				<span className={cn(row.isReached && "font-medium text-foreground")}>
					{row.label}
				</span>
				<span className="truncate text-tertiary-foreground">{row.detail}</span>
				<AtomStatusChip chip={row.chip} />
			</li>
		))}
	</ul>
);

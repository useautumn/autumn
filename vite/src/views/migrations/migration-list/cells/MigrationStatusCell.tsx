import { cn } from "@/lib/utils";
import type { MigrationRowView } from "../rowView/deriveMigrationRowView";
import { SEGMENTS, type StatusView } from "../rowView/statusView";
import { RunErrorNotice } from "./RunErrorNotice";
import { CellHoverCard, PopoverSeparator, ViewChip } from "./ViewChip";

export function StatusCard({ status }: { status: StatusView }) {
	const { card, ring } = status;
	return (
		<>
			<div className="flex flex-col items-start gap-1.5">
				<ViewChip chip={card.chip} ring={ring} />
				<span className="text-tertiary-foreground">{card.when}</span>
			</div>
			{card.note && (
				<span className="text-tertiary-foreground">{card.note}</span>
			)}
			{card.error && <RunErrorNotice error={card.error} />}
			{card.legend.length > 0 && <PopoverSeparator />}
			{card.legend.map((segment) => (
				<div
					key={segment.kind}
					className="flex items-center justify-between gap-3"
				>
					<span className="flex items-center gap-1.5 text-muted-foreground">
						<span
							className={cn(
								"size-2 rounded-full",
								SEGMENTS[segment.kind].className,
							)}
						/>
						{SEGMENTS[segment.kind].label}
					</span>
					<span className="font-medium text-foreground tabular-nums">
						{segment.value.toLocaleString("en-US")}
					</span>
				</div>
			))}
		</>
	);
}

export function MigrationStatusCell({ view }: { view: MigrationRowView }) {
	const { status } = view;
	return (
		<CellHoverCard
			trigger={
				<div className="flex min-w-0">
					<ViewChip chip={status.chip} ring={status.ring} />
				</div>
			}
		>
			<StatusCard status={status} />
		</CellHoverCard>
	);
}

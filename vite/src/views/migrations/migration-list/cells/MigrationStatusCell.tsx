import { cn } from "@/lib/utils";
import type { MigrationRowView } from "../rowView/deriveMigrationRowView";
import { BAR_TRACKS, SEGMENTS, type StatusView } from "../rowView/statusView";
import { CellHoverCard, PopoverSeparator, ViewChip } from "./ViewChip";

function SegmentedBar({ bar }: { bar: StatusView["bar"] }) {
	return (
		<div
			className={cn(
				"flex h-1.5 min-w-0 max-w-[140px] flex-1 gap-px overflow-clip rounded-full",
				BAR_TRACKS[bar.track],
			)}
		>
			{bar.segments.map((segment) => (
				<div
					key={segment.kind}
					className={cn(
						"h-1.5 min-w-0.5 basis-0",
						SEGMENTS[segment.kind].className,
					)}
					style={{ flexGrow: segment.value }}
				/>
			))}
		</div>
	);
}

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
			{card.error && (
				<span className="text-[13px] leading-[18px] font-medium text-foreground">
					{card.error}
				</span>
			)}
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
	const pill = (
		<div className="flex w-[156px] shrink-0">
			<ViewChip chip={status.chip} ring={status.ring} />
		</div>
	);

	return (
		<div className="flex w-full min-w-0 items-center gap-2.5 pr-2">
			<CellHoverCard trigger={pill}>
				<StatusCard status={status} />
			</CellHoverCard>
			<SegmentedBar bar={status.bar} />
		</div>
	);
}

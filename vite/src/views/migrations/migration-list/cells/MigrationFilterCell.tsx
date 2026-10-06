import { Fragment } from "react";
import { pluralize } from "../rowView/chipView";
import type { MigrationRowView } from "../rowView/deriveMigrationRowView";
import {
	CellHoverCard,
	ChipList,
	CountChip,
	PopoverHeading,
	PopoverRow,
	PopoverSeparator,
	ViewChip,
} from "./ViewChip";

function OrDivider() {
	return (
		<div className="flex items-center gap-2">
			<span className="text-xs font-semibold text-muted-foreground">Or</span>
			<div className="h-px grow bg-overlay-separator preset:bg-border" />
		</div>
	);
}

export function MigrationFilterCell({ view }: { view: MigrationRowView }) {
	const { filter, customerCount } = view;
	if (!filter) return <span className="text-xs text-subtle">No filter</span>;

	return (
		<CellHoverCard
			trigger={
				<div className="flex min-w-0 items-center gap-1.5">
					<ViewChip chip={filter.head} />
					{filter.extraCount > 0 && <CountChip count={filter.extraCount} />}
				</div>
			}
		>
			<PopoverHeading
				title="Filter"
				subtitle={
					customerCount === null
						? undefined
						: `${pluralize({ count: customerCount, noun: "customer" })} match`
				}
			/>
			<PopoverSeparator />
			<div className="flex flex-col gap-2.5">
				{filter.groups.map((group, groupIndex) => (
					<Fragment key={group.map((row) => row.label).join("|") + groupIndex}>
						{groupIndex > 0 && <OrDivider />}
						{group.map((row, rowIndex) => (
							<PopoverRow key={`${row.label}-${rowIndex}`} label={row.label}>
								<ChipList
									chips={row.chips}
									moreCount={row.moreCount}
									className="justify-end"
								/>
							</PopoverRow>
						))}
					</Fragment>
				))}
			</div>
		</CellHoverCard>
	);
}

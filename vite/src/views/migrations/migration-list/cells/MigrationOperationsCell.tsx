import { Fragment } from "react";
import {
	AutumnMark,
	StripeMark,
} from "../../migration/shared/BillingScopeMarks";
import type { MigrationRowView } from "../rowView/deriveMigrationRowView";
import { ModificationRow } from "./ModificationRow";
import {
	CellHoverCard,
	ChipList,
	CountChip,
	PopoverHeading,
	PopoverRow,
	PopoverSeparator,
	ViewChip,
} from "./ViewChip";

const BILLING = {
	autumn: {
		label: "Autumn only",
		mark: <AutumnMark />,
		className: "text-tertiary-foreground",
	},
	stripe: {
		label: "Autumn + Stripe",
		mark: <StripeMark />,
		className: "text-[#8e7cff]",
	},
};

export function MigrationOperationsCell({ view }: { view: MigrationRowView }) {
	const { operations } = view;
	if (!operations)
		return <span className="text-xs text-subtle">No operations</span>;
	const billing = BILLING[operations.billing];

	return (
		<CellHoverCard
			className="w-96"
			trigger={
				<div className="flex min-w-0 items-center gap-1.5">
					<ViewChip chip={operations.head} />
					{operations.inline && <ViewChip chip={operations.inline} />}
					{operations.extraCount > 0 && (
						<CountChip count={operations.extraCount} />
					)}
				</div>
			}
		>
			<PopoverHeading title="Operations" subtitle={operations.subtitle} />
			{operations.targets.chips.length > 0 && (
				<ChipList
					chips={operations.targets.chips}
					moreCount={operations.targets.moreCount}
				/>
			)}
			<PopoverSeparator />
			<div className="flex flex-col gap-2.5">
				{operations.modifications.map((modification, index) => (
					<Fragment key={`${modification.chip.label}-${index}`}>
						{modification.planLabel &&
							modification.planLabel !==
								operations.modifications[index - 1]?.planLabel && (
								<span className="pt-0.5 text-[11px] font-medium text-tertiary-foreground">
									{modification.planLabel}
								</span>
							)}
						<ModificationRow modification={modification} />
					</Fragment>
				))}
			</div>
			<PopoverSeparator />
			<PopoverRow label="Billing">
				<span className="flex items-center gap-1.5 font-medium text-muted-foreground">
					<span className={`flex ${billing.className}`}>{billing.mark}</span>
					{billing.label}
				</span>
			</PopoverRow>
		</CellHoverCard>
	);
}

import {
	AutumnMark,
	StripeMark,
} from "../../migration/shared/BillingScopeMarks";
import type { MigrationRowView } from "../rowView/deriveMigrationRowView";
import type { ModificationView } from "../rowView/operationsView";
import {
	CellHoverCard,
	CountChip,
	PopoverHeading,
	PopoverRow,
	PopoverSeparator,
	ViewChip,
} from "./ViewChip";

const SIGNS: Record<
	ModificationView["sign"],
	{ mark: string; className: string }
> = {
	add: { mark: "+", className: "text-[#30A46C]" },
	change: { mark: "~", className: "text-[#E5A21F]" },
	remove: { mark: "−", className: "text-[#E5484D]" },
};

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
			<PopoverSeparator />
			<div className="flex flex-col gap-2.5">
				{operations.modifications.map((modification, index) => (
					<div
						key={`${modification.chip.label}-${index}`}
						className="flex items-center gap-1.5"
					>
						<span
							className={`w-2.5 shrink-0 text-center font-semibold ${SIGNS[modification.sign].className}`}
						>
							{SIGNS[modification.sign].mark}
						</span>
						<ViewChip chip={modification.chip} />
					</div>
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

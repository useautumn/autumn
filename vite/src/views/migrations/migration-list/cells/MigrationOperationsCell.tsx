import { StatusChip, StatusChipIcon } from "@autumn/ui";
import { Fragment } from "react";
import {
	AutumnMark,
	StripeMark,
} from "../../migration/shared/BillingScopeMarks";
import type { MigrationRowView } from "../rowView/deriveMigrationRowView";
import type { ModificationView } from "../rowView/operationsView";
import {
	CellHoverCard,
	ChipList,
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
				{operations.modifications.map((modification, index) => {
					const { tile } = modification.chip;
					const planLabel = modification.planLabel;
					return (
						<Fragment key={`${modification.chip.label}-${index}`}>
							{planLabel &&
								planLabel !==
									operations.modifications[index - 1]?.planLabel && (
									<span className="pt-0.5 text-[11px] font-medium text-tertiary-foreground">
										{planLabel}
									</span>
								)}
							<div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-1.5">
								<span
									className={`w-2.5 shrink-0 text-center font-semibold ${SIGNS[modification.sign].className}`}
								>
									{SIGNS[modification.sign].mark}
								</span>
								<div className="col-span-2 flex min-w-0">
									<ViewChip chip={modification.chip} />
								</div>
								{tile && !!modification.children?.length && (
									<StatusChipIcon
										className="invisible col-start-2 self-start"
										glyph={tile.glyph}
										tone={tile.tone}
									/>
								)}
								{!!modification.children?.length && (
									<div className="col-start-3 flex flex-col items-start gap-1.5">
										{modification.children.map(({ key, tile, change }) => (
											<StatusChip
												className="h-auto min-h-[22px] items-start whitespace-normal py-[3px]"
												glyph={tile.glyph}
												key={key}
												tone={tile.tone}
											>
												<span className="shrink-0 whitespace-nowrap">
													{change.label}
												</span>
												{change.to !== undefined && (
													<span className="min-w-0 font-[450] text-tertiary-foreground">
														{change.from !== undefined && (
															<span className="text-subtle">
																<s>{change.from}</s> →{" "}
															</span>
														)}
														<span className="font-medium text-foreground">
															{change.to}
														</span>{" "}
														credits
													</span>
												)}
											</StatusChip>
										))}
									</div>
								)}
							</div>
						</Fragment>
					);
				})}
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

import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
import { Sheet, SheetContent } from "@/components/v2/sheets/Sheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { CaretDownIcon } from "@phosphor-icons/react";
import { PlanFeatureIcon } from "@/views/products/plan/components/plan-card/PlanFeatureIcon";
import { CustomDotIcon } from "@/views/products/plan/components/plan-card/PlanFeatureRow";
import { RemoveButton } from "../shared/RemoveButton";
import {
	BillingMethodDropdown,
	type ItemFilter,
	INTERVAL_OPTIONS,
	filterToProductItem,
	getFilterSummary,
} from "./operationItemUtils";

export function RemoveItemRows({
	item,
	onChange,
	onRemove,
}: {
	item: Record<string, unknown>;
	onChange: (item: Record<string, unknown>) => void;
	onRemove: () => void;
}) {
	const { features } = useFeaturesQuery();
	const [sheetOpen, setSheetOpen] = useState(false);

	const filter = item as ItemFilter;
	const hasFeature = !!filter.feature_id;

	return (
		<>
			<div className="flex items-center gap-2 group/row">
				<span className="text-xs text-red-500/60 w-14 shrink-0 select-none">
					Remove
				</span>
				<button
					type="button"
					onClick={() => setSheetOpen(true)}
					className="flex items-center gap-2 h-8 px-3 w-full select-none rounded-xl cursor-pointer text-left input-base input-state-open-tiny"
				>
					{hasFeature ? (
						<>
							<div className="flex flex-row items-center gap-1 shrink-0">
								<PlanFeatureIcon
									item={filterToProductItem(filter)}
									position="left"
								/>
								<CustomDotIcon />
								<PlanFeatureIcon
									item={filterToProductItem(filter)}
									position="right"
								/>
							</div>
							<span className="text-body whitespace-nowrap truncate flex-1 min-w-0">
								{getFilterSummary(filter, features)}
							</span>
						</>
					) : (
						<span className="text-subtle">Configure removal...</span>
					)}
				</button>
				<RemoveButton onClick={onRemove} />
			</div>

			<RemoveItemSheet
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				item={filter}
				onSave={(updated) => {
					onChange(updated);
					setSheetOpen(false);
				}}
			/>
		</>
	);
}

function RemoveItemSheet({
	open,
	onOpenChange,
	item,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	item: ItemFilter;
	onSave: (item: ItemFilter) => void;
}) {
	const [key, setKey] = useState(0);

	return (
		<Sheet
			open={open}
			onOpenChange={(isOpen) => {
				if (isOpen) setKey((k) => k + 1);
				onOpenChange(isOpen);
			}}
		>
			<SheetContent side="right" hideCloseButton>
				{open && (
					<RemoveItemSheetContent
						key={key}
						item={item}
						onSave={onSave}
						onCancel={() => onOpenChange(false)}
					/>
				)}
			</SheetContent>
		</Sheet>
	);
}

function RemoveItemSheetContent({
	item,
	onSave,
	onCancel,
}: {
	item: ItemFilter;
	onSave: (item: ItemFilter) => void;
	onCancel: () => void;
}) {
	const { features } = useFeaturesQuery();
	const [draft, setDraft] = useState<ItemFilter>(() =>
		structuredClone(item),
	);

	const canSave = !!draft.feature_id;

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
				<div>
					<h3 className="text-sm font-medium text-foreground mb-1">
						Remove Item
					</h3>
					<p className="text-xs text-tertiary-foreground">
						Select a feature to remove from the plan. Use interval
						and billing method to narrow the match.
					</p>
				</div>

				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<label className="text-xs font-medium text-foreground">
							Feature
						</label>
						<FeatureSearchDropdown
							features={features}
							value={draft.feature_id ?? null}
							onSelect={(v) =>
								setDraft({ ...draft, feature_id: v })
							}
							placeholder="Select feature..."
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<label className="text-xs font-medium text-foreground">
							Interval
						</label>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="flex items-center justify-between w-full rounded-lg border bg-transparent text-sm outline-none h-input input-base input-shadow-default input-state-open p-2"
								>
									<span className="truncate">
										{draft.interval
											? INTERVAL_OPTIONS.find((o) => o.value === draft.interval)?.label ?? draft.interval
											: "Any interval"}
									</span>
									<CaretDownIcon className="size-4 opacity-50" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="start"
								className="w-(--anchor-width) p-1"
							>
								{draft.interval && (
									<DropdownMenuItem
										onClick={() =>
											setDraft({ ...draft, interval: undefined })
										}
										className="py-1.5 px-2 text-muted-foreground"
									>
										Any interval
									</DropdownMenuItem>
								)}
								{INTERVAL_OPTIONS.map((o) => (
									<DropdownMenuItem
										key={o.value}
										onClick={() =>
											setDraft({ ...draft, interval: o.value })
										}
										className="py-1.5 px-2"
									>
										{o.label}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						<p className="text-xs text-tertiary-foreground">
							Narrow the match when the same feature appears at
							multiple intervals.
						</p>
					</div>

					<div className="flex flex-col gap-1.5">
						<label className="text-xs font-medium text-foreground">
							Billing method
						</label>
						<BillingMethodDropdown
							value={draft.billing_method ?? null}
							onChange={(v) =>
								setDraft({ ...draft, billing_method: v })
							}
						/>
					</div>
				</div>
			</div>

			<div className="shrink-0 p-4 border-t border-border/40 flex gap-2">
				<Button
					variant="secondary"
					onClick={onCancel}
					className="flex-1"
				>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={() => onSave(draft)}
					disabled={!canSave}
					className="flex-1"
				>
					Apply
				</Button>
			</div>
		</div>
	);
}

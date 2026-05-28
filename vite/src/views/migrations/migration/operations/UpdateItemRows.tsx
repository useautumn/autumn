import type { ProductItem, UpdatePlanItemParamsV1 } from "@autumn/shared";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { Sheet, SheetContent } from "@/components/v2/sheets/Sheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { PlanFeatureIcon } from "@/views/products/plan/components/plan-card/PlanFeatureIcon";
import { CustomDotIcon } from "@/views/products/plan/components/plan-card/PlanFeatureRow";
import { RemoveButton } from "../shared/RemoveButton";
import {
	BillingMethodDropdown,
	CLEAR_VALUE,
	INTERVAL_OPTIONS,
	filterToProductItem,
	getFilterSummary,
} from "./operationItemUtils";

function updateFilterToProductItem(item: UpdatePlanItemParamsV1): ProductItem {
	const base = filterToProductItem({
		feature_id: item.filter?.feature_id,
		interval: item.filter?.interval,
		billing_method: item.filter?.billing_method,
	});
	return {
		...base,
		included_usage: item.included,
		interval: item.interval ?? base.interval,
	} as ProductItem;
}

function updateFilterFromProductItem(item: UpdatePlanItemParamsV1): ProductItem {
	return filterToProductItem({
		feature_id: item.filter?.feature_id,
		interval: item.filter?.interval,
		billing_method: item.filter?.billing_method,
	});
}

function getIntervalLabel(interval?: string) {
	if (!interval) return null;
	return INTERVAL_OPTIONS.find((o) => o.value === interval)?.label ?? interval;
}

function normalizeIncludedValue(value: unknown) {
	if (value === "" || value === null || value === undefined) return undefined;
	const numericValue = typeof value === "number" ? value : Number(value);
	return Number.isFinite(numericValue) ? numericValue : undefined;
}

function normalizeUpdateItem(item: UpdatePlanItemParamsV1): UpdatePlanItemParamsV1 {
	const { included: _included, ...rest } = item;
	const included = normalizeIncludedValue(
		(item as { included?: unknown }).included,
	);

	return included === undefined ? rest : { ...rest, included };
}

export function UpdateItemRows({
	item,
	onChange,
	onRemove,
}: {
	item: UpdatePlanItemParamsV1;
	onChange: (item: UpdatePlanItemParamsV1) => void;
	onRemove: () => void;
}) {
	const { features } = useFeaturesQuery();
	const [sheetOpen, setSheetOpen] = useState(false);

	const hasFeature = !!item.filter?.feature_id;
	const summary = hasFeature
		? getFilterSummary(
				{ feature_id: item.filter?.feature_id, interval: item.filter?.interval },
				features,
			)
		: null;
	const updates = [
		item.included !== undefined ? `${item.included} included` : null,
		getIntervalLabel(item.interval),
	].filter(Boolean);
	const secondary = updates.length > 0 ? `→ ${updates.join(" · ")}` : "";

	return (
		<>
			<div className="flex items-center gap-2 group/row">
				<span className="text-xs text-yellow-500/60 w-14 shrink-0 select-none">
					Update
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
									item={updateFilterFromProductItem(item)}
									position="left"
								/>
								<CustomDotIcon />
								<PlanFeatureIcon
									item={updateFilterToProductItem(item)}
									position="right"
								/>
							</div>
							<p className="whitespace-nowrap truncate flex-1 min-w-0">
								<span className="text-body">
									{summary}
								</span>
								<span className="text-body-secondary">
									{" "}{secondary}
								</span>
							</p>
						</>
					) : (
						<span className="text-subtle">Configure update...</span>
					)}
				</button>
				<RemoveButton onClick={onRemove} />
			</div>

			<UpdateItemSheet
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				item={item}
				onSave={(updated) => {
					onChange(updated);
					setSheetOpen(false);
				}}
			/>
		</>
	);
}

function UpdateItemSheet({
	open,
	onOpenChange,
	item,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	item: UpdatePlanItemParamsV1;
	onSave: (item: UpdatePlanItemParamsV1) => void;
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
					<UpdateItemSheetContent
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

function UpdateItemSheetContent({
	item,
	onSave,
	onCancel,
}: {
	item: UpdatePlanItemParamsV1;
	onSave: (item: UpdatePlanItemParamsV1) => void;
	onCancel: () => void;
}) {
	const { features } = useFeaturesQuery();
	const [draft, setDraft] = useState<UpdatePlanItemParamsV1>(
		() => structuredClone(item),
	);

	const normalizedDraft = normalizeUpdateItem(draft);
	const featureId = draft.filter?.feature_id ?? null;
	const canSave =
		!!featureId &&
		(normalizedDraft.included !== undefined ||
			normalizedDraft.interval !== undefined);
	const newIntervalLabel = getIntervalLabel(draft.interval);

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
				<div>
					<h3 className="text-sm font-medium text-foreground mb-1">
						Update Item
					</h3>
					<p className="text-xs text-tertiary-foreground">
						Override properties on an existing plan item. Use the
						filter fields to target the specific item.
					</p>
				</div>

				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<label className="text-xs font-medium text-foreground">
							Feature
						</label>
						<FeatureSearchDropdown
							features={features}
							value={featureId}
							onSelect={(v) =>
								setDraft({
									...draft,
									filter: { ...draft.filter, feature_id: v },
								})
							}
							placeholder="Select feature..."
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<label className="text-xs font-medium text-foreground">
							Interval
						</label>
						<Select
							value={draft.filter?.interval ?? ""}
							onValueChange={(v) => {
								const interval =
									v === CLEAR_VALUE ? undefined : v;
								setDraft({
									...draft,
									filter: {
										...draft.filter,
										interval:
											interval as UpdatePlanItemParamsV1["filter"]["interval"],
									},
								});
							}}
						>
							<SelectTrigger className="h-8 rounded-xl">
								<span className="flex-1 text-left text-sm">
									{draft.filter?.interval ? (
										<SelectValue />
									) : (
										<span className="text-muted-foreground">
											Any interval
										</span>
									)}
								</span>
							</SelectTrigger>
							<SelectContent>
								{draft.filter?.interval && (
									<SelectItem
										value={CLEAR_VALUE}
										className="text-muted-foreground"
									>
										Any interval
									</SelectItem>
								)}
								{INTERVAL_OPTIONS.map((o) => (
									<SelectItem key={o.value} value={o.value}>
										{o.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
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
							value={draft.filter?.billing_method ?? null}
							onChange={(v) =>
								setDraft({
									...draft,
									filter: {
										...draft.filter,
										billing_method:
											v as UpdatePlanItemParamsV1["filter"]["billing_method"],
									},
								})
							}
						/>
					</div>

					<div className="border-t pt-3 mt-1 flex flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<label className="text-xs font-medium text-foreground">
								New Included Usage
							</label>
							<Input
								type="number"
								min={0}
								value={draft.included ?? ""}
								onChange={(e) => {
									const val = e.target.value;
									setDraft({
										...draft,
										included:
											val === ""
												? undefined
												: Number(val),
									});
								}}
								placeholder="New included amount"
								className="h-8 rounded-xl"
							/>
							<p className="text-xs text-tertiary-foreground">
								The new allowance for matched items.
							</p>
						</div>

						<div className="flex flex-col gap-1.5">
							<label className="text-xs font-medium text-foreground">
								New Interval
							</label>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="flex items-center justify-between w-full rounded-lg border bg-transparent text-sm outline-none h-input input-base input-shadow-default input-state-open p-2"
									>
										<span
											className={
												newIntervalLabel
													? "truncate"
													: "truncate text-muted-foreground"
											}
										>
											{newIntervalLabel ?? "Leave unchanged"}
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
											Leave unchanged
										</DropdownMenuItem>
									)}
									{INTERVAL_OPTIONS.map((o) => (
										<DropdownMenuItem
											key={o.value}
											onClick={() =>
												setDraft({
													...draft,
													interval:
														o.value as UpdatePlanItemParamsV1["interval"],
												})
											}
											className="py-1.5 px-2"
										>
											{o.label}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
							<p className="text-xs text-tertiary-foreground">
								Change the reset interval for matched items.
							</p>
						</div>
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
					onClick={() => onSave(normalizedDraft)}
					disabled={!canSave}
					className="flex-1"
				>
					Apply
				</Button>
			</div>
		</div>
	);
}

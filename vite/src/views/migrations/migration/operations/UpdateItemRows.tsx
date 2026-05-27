import type { ProductItem, UpdatePlanItemParamsV1 } from "@autumn/shared";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
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
	return { ...base, included_usage: item.included } as ProductItem;
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
	const summary = hasFeature ? getFilterSummary(
		{ feature_id: item.filter?.feature_id, interval: item.filter?.interval },
		features,
	) : null;
	const secondary =
		item.included !== undefined ? `→ ${item.included} included` : "";

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
								<PlanFeatureIcon item={updateFilterToProductItem(item)} position="left" />
								<CustomDotIcon />
								<PlanFeatureIcon item={updateFilterToProductItem(item)} position="right" />
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

	const featureId = draft.filter?.feature_id ?? null;
	const canSave = !!featureId;

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

					<div className="border-t pt-3 mt-1">
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
								The new allowance for matched items. Existing
								usage carries forward.
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

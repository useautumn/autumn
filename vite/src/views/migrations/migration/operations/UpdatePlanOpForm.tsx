import type {
	BillingInterval,
	FrontendProduct,
	ProductItem,
	UpdatePlanItemParamsV1,
	UpdatePlanOp,
} from "@autumn/shared";
import { productV2ToBasePrice } from "@autumn/shared";
import {
	CurrencyCircleDollarIcon,
	GitBranchIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { DASHED_BUTTON_CLASS } from "../shared/AddButton";
import {
	migrationItemToProductItem,
	productItemToMigrationItem,
} from "../shared/migrationItemUtils";
import { buildPlanSuggestions } from "../shared/planSuggestions";
import { RemoveButton } from "../shared/RemoveButton";
import { ValuePicker } from "../shared/ValuePicker";
import { ItemSummaryRow } from "./ItemSummaryRow";
import {
	MigrationOperationSheet,
	type OperationSheetMode,
} from "./MigrationOperationSheet";
import { RemoveItemRows } from "./RemoveItemRows";
import { UpdateItemRows } from "./UpdateItemRows";

function useVersionOptions(planFilter: UpdatePlanOp["plan_filter"]) {
	const { products } = useProductsQuery({ allVersions: true });

	const targetIds = extractPlanIds(planFilter.plan_id);
	const idSet = new Set(targetIds);

	const matchingProducts =
		idSet.size > 0 ? products.filter((p) => idSet.has(p.id)) : [];

	const seen = new Set<number>();
	return matchingProducts
		.filter((p) => {
			if (seen.has(p.version)) return false;
			seen.add(p.version);
			return true;
		})
		.map((p) => ({
			value: String(p.version),
			label: `v${p.version}`,
		}))
		.sort((a, b) => Number(a.value) - Number(b.value));
}

export function UpdatePlanOpForm({
	value,
	onChange,
	onRemove,
	defaultOpenPicker = false,
}: {
	value: UpdatePlanOp;
	onChange: (value: UpdatePlanOp) => void;
	onRemove: () => void;
	defaultOpenPicker?: boolean;
}) {
	const { products } = useProductsQuery();
	const versionOptions = useVersionOptions(value.plan_filter);
	const { features } = useFeaturesQuery();

	const [sheetOpen, setSheetOpen] = useState(false);
	const [sheetMode, setSheetMode] = useState<OperationSheetMode>("add-feature");
	const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

	const update = (patch: Partial<UpdatePlanOp>) =>
		onChange({ ...value, ...patch });

	const planSuggestions = useMemo(
		() => buildPlanSuggestions(products),
		[products],
	);

	const selectedPlanIds = extractPlanIds(value.plan_filter.plan_id);

	const handlePlanToggle = (planId: string) => {
		const next = selectedPlanIds.includes(planId)
			? selectedPlanIds.filter((id) => id !== planId)
			: [...selectedPlanIds, planId];
		update({
			plan_filter: { ...value.plan_filter, plan_id: toPlanIdMatcher(next) },
		});
	};

	const handlePlanRemove = (planId: string) => {
		const next = selectedPlanIds.filter((id) => id !== planId);
		update({
			plan_filter: { ...value.plan_filter, plan_id: toPlanIdMatcher(next) },
		});
	};

	const customize = value.customize;
	const addItems = customize?.add_items ?? [];

	const openSheet = (mode: OperationSheetMode, itemIndex?: number) => {
		setSheetMode(mode);
		setEditingItemIndex(itemIndex ?? null);
		setSheetOpen(true);
	};

	const editItem: ProductItem | undefined =
		editingItemIndex !== null
			? migrationItemToProductItem(addItems[editingItemIndex], features)
			: undefined;

	const initialProduct = buildInitialProduct(value);

	const handleSheetSave = (product: FrontendProduct) => {
		if (sheetMode === "edit-price") {
			const basePrice = productV2ToBasePrice({ product });
			if (basePrice) {
				const amount =
					((basePrice as Record<string, unknown>).price as number) ??
					basePrice.tiers?.[0]?.amount ??
					0;
				update({
					customize: {
						...customize,
						price: {
							amount,
							interval: (basePrice.interval as BillingInterval) ?? "month",
						},
					},
				});
			} else if (product.planType === "free") {
				update({
					customize: {
						...customize,
						price: undefined,
					},
				});
			}
		} else {
			const newItems = (product.items ?? [])
				.filter((pi) => pi.feature_id)
				.map(productItemToMigrationItem);

			if (newItems.length === 0) return;

			const items = [...addItems];
			if (editingItemIndex !== null) {
				items[editingItemIndex] = newItems[0];
			} else {
				items.push(...newItems);
			}
			update({ customize: { ...customize, add_items: items } });
		}
	};

	const handleRemoveItem = (index: number) => {
		const items = addItems.filter((_, i) => i !== index);
		update({
			customize: {
				...customize,
				add_items: items.length > 0 ? items : undefined,
			},
		});
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between group/row">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-foreground">
						{selectedPlanIds.length > 1 ? "Update Plans" : "Update Plan"}
					</span>
					{selectedPlanIds.length > 0 && (
						<span className="text-xs text-tertiary-foreground">
							{selectedPlanIds.length}{" "}
							{selectedPlanIds.length === 1 ? "plan" : "plans"}
						</span>
					)}
				</div>
				<RemoveButton onClick={onRemove} />
			</div>

			<div className="flex items-center gap-2 group/row">
				<ValuePicker
					suggestions={planSuggestions}
					selectedValues={selectedPlanIds}
					onToggle={handlePlanToggle}
					onRemove={handlePlanRemove}
					placeholder="Select plans..."
					className="flex-1"
					defaultOpen={defaultOpenPicker}
				/>
			</div>

			{value.version !== undefined && (
				<div className="flex items-center gap-2 group/row">
					<span className="text-xs text-subtle w-14 shrink-0 select-none">
						Version
					</span>
					<Select
						value={String(value.version)}
						onValueChange={(v) => update({ version: Number(v) })}
						items={Object.fromEntries(
							versionOptions.map((o) => [o.value, o.label]),
						)}
					>
						<SelectTrigger className="h-8 rounded-xl flex-1">
							<GitBranchIcon
								size={16}
								weight="duotone"
								className="text-violet-500 shrink-0"
							/>
							<span className="flex-1 text-left text-sm">
								<SelectValue />
							</span>
						</SelectTrigger>
						<SelectContent>
							{versionOptions.map((o) => (
								<SelectItem key={o.value} value={o.value}>
									{o.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<RemoveButton onClick={() => update({ version: undefined })} />
				</div>
			)}

			{customize?.price !== undefined && (
				<div className="flex items-center gap-2 group/row">
					<span className="text-xs text-subtle w-14 shrink-0 select-none">
						Price
					</span>
					<button
						type="button"
						onClick={() => openSheet("edit-price")}
						className="flex items-center gap-2 h-8 px-3 rounded-xl input-base input-state-open-tiny cursor-pointer flex-1 min-w-0"
					>
						<CurrencyCircleDollarIcon
							size={16}
							weight="duotone"
							className="text-yellow-500 shrink-0"
						/>
						<span className="text-body">
							${customize.price?.amount ?? 0} per{" "}
							{customize.price?.interval ?? "month"}
						</span>
					</button>
					<RemoveButton
						onClick={() =>
							update({ customize: { ...customize, price: undefined } })
						}
					/>
				</div>
			)}

			{addItems.map((item, index) => (
				<div key={`add-${index}`} className="flex items-center gap-2 group/row">
					<span className="text-xs text-green-500/60 w-14 shrink-0 select-none">Add</span>
					<ItemSummaryRow
						item={item}
						onClick={() => openSheet("edit-feature", index)}
					/>
					<RemoveButton onClick={() => handleRemoveItem(index)} />
				</div>
			))}

			{(customize?.remove_items ?? []).map((item, index) => (
				<RemoveItemRows
					key={`remove-${index}`}
					item={item}
					onChange={(updated) => {
						const items = [...(customize?.remove_items ?? [])];
						items[index] = updated;
						update({ customize: { ...customize, remove_items: items } });
					}}
					onRemove={() => {
						const items = (customize?.remove_items ?? []).filter(
							(_, i) => i !== index,
						);
						update({
							customize: {
								...customize,
								remove_items: items.length > 0 ? items : undefined,
							},
						});
					}}
				/>
			))}

			{(customize?.update_items ?? []).map((item, index) => (
				<UpdateItemRows
					key={`update-${index}`}
					item={item}
					onChange={(updated) => {
						const items = [...(customize?.update_items ?? [])];
						items[index] = updated;
						update({ customize: { ...customize, update_items: items } });
					}}
					onRemove={() => {
						const items = (customize?.update_items ?? []).filter(
							(_, i) => i !== index,
						);
						update({
							customize: {
								...customize,
								update_items: items.length > 0 ? items : undefined,
							},
						});
					}}
				/>
			))}

			<DropdownMenu>
				<DropdownMenuTrigger className={DASHED_BUTTON_CLASS}>
					<PlusIcon size={10} />
					Add a modification to this plan
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-(--anchor-width)">
					{value.version === undefined && (
						<DropdownMenuItem
							closeOnClick
							onClick={() => update({ version: 1 })}
					>
						Set Plan Version
					</DropdownMenuItem>
					)}
					{(!customize || customize.price === undefined) && (
						<DropdownMenuItem
							closeOnClick
							onClick={() => openSheet("edit-price")}
						>
							Base Price
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						closeOnClick
						onClick={() => openSheet("add-feature")}
					>
						Add Item
					</DropdownMenuItem>
					<DropdownMenuItem
						closeOnClick
						onClick={() =>
							update({
								customize: {
									...customize,
									remove_items: [
										...(customize?.remove_items ?? []),
										{} as Record<string, unknown>,
									],
								},
							})
						}
					>
						Remove Item
					</DropdownMenuItem>
					<DropdownMenuItem
						closeOnClick
						onClick={() =>
							update({
								customize: {
									...customize,
									update_items: [
										...(customize?.update_items ?? []),
										{ filter: {} } as unknown as UpdatePlanItemParamsV1,
									],
								},
							})
						}
					>
						Update Item
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<MigrationOperationSheet
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				mode={sheetMode}
				initialProduct={initialProduct}
				editItem={editItem}
				onSave={handleSheetSave}
			/>
		</div>
	);
}

function extractPlanIds(
	planId: UpdatePlanOp["plan_filter"]["plan_id"],
): string[] {
	if (!planId) return [];
	if (typeof planId === "string") return planId ? [planId] : [];
	if (planId.$in)
		return planId.$in.filter((v): v is string => typeof v === "string");
	if (planId.$eq) return typeof planId.$eq === "string" ? [planId.$eq] : [];
	return [];
}

function toPlanIdMatcher(
	ids: string[],
): UpdatePlanOp["plan_filter"]["plan_id"] {
	if (ids.length === 0) return undefined;
	if (ids.length === 1) return ids[0];
	return { $in: ids };
}

function buildInitialProduct(value: UpdatePlanOp): Partial<FrontendProduct> {
	const items: ProductItem[] = [];

	if (value.customize?.price) {
		const amount = value.customize.price.amount ?? 0;
		items.push({
			price: amount,
			tiers: [{ to: "inf", amount }],
			interval: value.customize.price.interval ?? "month",
			billing_units: 1,
		} as ProductItem);
	}

	return {
		version: value.version ?? 1,
		planType: value.customize?.price ? "paid" : "free",
		basePriceType: "recurring",
		items,
	};
}

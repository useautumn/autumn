import type { CustomizePlanLicense, FrontendProduct } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { CurrencyCircleDollarIcon, PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { DASHED_BUTTON_CLASS } from "../shared/AddButton";
import {
	migrationItemToProductItem,
	productItemToMigrationItem,
} from "../shared/migrationItemUtils";
import { RemoveButton } from "../shared/RemoveButton";
import { ItemSummaryRow } from "./ItemSummaryRow";
import {
	MigrationOperationSheet,
	type OperationSheetMode,
} from "./MigrationOperationSheet";
import { RemoveItemRows } from "./RemoveItemRows";

type LicenseCustomize = NonNullable<CustomizePlanLicense["customize"]>;
type LicenseItems = LicenseCustomize["add_items"];
type LicenseFilters = LicenseCustomize["remove_items"];

export function UpsertLicenseRows({
	license,
	initialProduct,
	onChange,
	onRemove,
}: {
	license: CustomizePlanLicense;
	initialProduct: FrontendProduct;
	onChange: (license: CustomizePlanLicense) => void;
	onRemove: () => void;
}) {
	const { features } = useFeaturesQuery();
	const { licenseProducts } = useLicenseProductsQuery();
	const [sheetOpen, setSheetOpen] = useState(false);
	const [sheetMode, setSheetMode] = useState<OperationSheetMode>("add-feature");
	const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

	const addItems = license.customize?.add_items ?? [];
	const removeItems = license.customize?.remove_items ?? [];
	const licenseName =
		licenseProducts.find((product) => product.id === license.license_plan_id)
			?.name ?? license.license_plan_id;

	const updateCustomize = (patch: Partial<LicenseCustomize>) =>
		onChange({ ...license, customize: { ...license.customize, ...patch } });

	const updateItems = (items: LicenseItems) =>
		updateCustomize({ add_items: items?.length ? items : undefined });

	const updateFilters = (filters: LicenseFilters) =>
		updateCustomize({ remove_items: filters?.length ? filters : undefined });

	const openSheet = (mode: OperationSheetMode, itemIndex?: number) => {
		setSheetMode(mode);
		setEditingItemIndex(itemIndex ?? null);
		setSheetOpen(true);
	};

	const editItem =
		editingItemIndex !== null && addItems[editingItemIndex]
			? migrationItemToProductItem(addItems[editingItemIndex], features)
			: undefined;

	const handleSheetSave = (product: FrontendProduct) => {
		const newItems = (product.items ?? [])
			.filter((item) => item.feature_id)
			.map(productItemToMigrationItem);
		if (newItems.length === 0) return;

		const items = [...addItems];
		if (editingItemIndex !== null) {
			items[editingItemIndex] = newItems[0];
		} else {
			items.push(...newItems);
		}
		updateItems(items as LicenseItems);
	};

	return (
		<>
			<div className="flex items-center gap-2 group/row">
				<span className="shrink-0 flex items-center">
					<Tooltip>
						<TooltipTrigger asChild>
							<LicenseIcon size={16} />
						</TooltipTrigger>
						<TooltipContent>License</TooltipContent>
					</Tooltip>
				</span>
				<div className="flex items-center h-8 px-3 rounded-xl input-base flex-1 min-w-0">
					<span className="text-body truncate">{licenseName}</span>
				</div>
				<RemoveButton onClick={onRemove} />
			</div>

			<div className="flex flex-col gap-2 pl-6">
				{license.customize?.price !== undefined && (
					<div className="flex items-center gap-2 group/row">
						<span className="text-xs text-subtle w-10 shrink-0 select-none">
							Price
						</span>
						<div className="flex items-center gap-2 h-8 px-3 rounded-xl input-base flex-1 min-w-0">
							<CurrencyCircleDollarIcon
								size={16}
								weight="duotone"
								className="text-yellow-500 shrink-0"
							/>
							<span className="text-body truncate">
								${license.customize.price?.amount ?? 0} per{" "}
								{license.customize.price?.interval ?? "month"}
							</span>
						</div>
						<RemoveButton
							onClick={() => updateCustomize({ price: undefined })}
						/>
					</div>
				)}
				{addItems.map((item, index) => (
					<div
						className="flex items-center gap-2 group/row"
						key={`license-item-${index}`}
					>
						<span className="text-xs text-green-500/60 w-10 shrink-0 select-none">
							Add
						</span>
						<ItemSummaryRow
							item={item}
							onClick={() => openSheet("edit-feature", index)}
						/>
						<RemoveButton
							onClick={() =>
								updateItems(
									addItems.filter((_, i) => i !== index) as LicenseItems,
								)
							}
						/>
					</div>
				))}

				{removeItems.map((item, index) => (
					<RemoveItemRows
						item={item as Record<string, unknown>}
						key={`license-remove-${index}`}
						onChange={(updated) => {
							const filters = [...removeItems];
							filters[index] = updated as LicenseFilters[number];
							updateFilters(filters);
						}}
						onRemove={() =>
							updateFilters(removeItems.filter((_, i) => i !== index))
						}
					/>
				))}

				<DropdownMenu>
					<DropdownMenuTrigger className={DASHED_BUTTON_CLASS}>
						<PlusIcon size={10} />
						Add a modification to this license
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-(--anchor-width)">
						<DropdownMenuItem
							closeOnClick
							onClick={() => openSheet("add-feature")}
						>
							Add Item
						</DropdownMenuItem>
						<DropdownMenuItem
							closeOnClick
							onClick={() => updateFilters([...removeItems, {}])}
						>
							Remove Item
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<MigrationOperationSheet
				editItem={editItem}
				initialProduct={initialProduct}
				mode={sheetMode}
				onOpenChange={setSheetOpen}
				onSave={handleSheetSave}
				open={sheetOpen}
			/>
		</>
	);
}

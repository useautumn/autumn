import { formatAmount, type ProductItem, type ProductV2 } from "@autumn/shared";
import {
	PackageIcon,
	PencilSimpleIcon,
	PuzzlePieceIcon,
	XIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

export function getItemUnitPrice(item: ProductItem): number | null {
	if (item.price != null) return item.price;
	if (item.tiers?.length === 1) return item.tiers[0].amount ?? null;
	return null;
}

export function getPlanPriceLabel({
	product,
	customItems,
	prepaidOptions,
}: {
	product: ProductV2;
	customItems?: ProductItem[] | null;
	prepaidOptions?: Record<string, number>;
}): string | null {
	const items = customItems ?? product.items;
	const pricedItems =
		items?.filter((item) => getItemUnitPrice(item) != null && item.interval) ??
		[];

	if (pricedItems.length === 0) return "Free";

	const totalAmount = pricedItems.reduce((sum, item) => {
		const unitPrice = getItemUnitPrice(item) ?? 0;
		const quantity =
			item.feature_id && prepaidOptions?.[item.feature_id]
				? prepaidOptions[item.feature_id]
				: 1;
		return sum + unitPrice * quantity;
	}, 0);
	const firstItem = pricedItems[0]!;
	const intervalCount = firstItem.interval_count ?? 1;
	const intervalLabel =
		intervalCount === 1
			? `/${firstItem.interval}`
			: `/${intervalCount} ${firstItem.interval}s`;

	return `${formatAmount({
		currency: "USD",
		amount: totalAmount,
		amountFormatOptions: {
			style: "currency",
			currencyDisplay: "narrowSymbol",
		},
	})}${intervalLabel}`;
}

export function SchedulePlanRow({
	phaseIndex,
	planIndex,
	usedKeys,
}: {
	phaseIndex: number;
	planIndex: number;
	usedKeys: Set<string>;
}) {
	const {
		form,
		formValues,
		products,
		handleRemovePlan,
		isPhaseLocked,
		setEditingPlan,
	} = useCreateScheduleFormContext();
	const { setSheet } = useSheetStore();

	const plan = formValues.phases[phaseIndex]?.plans[planIndex];
	if (!plan) return null;
	const isLocked = isPhaseLocked({ phaseIndex });

	const availableProducts = products.filter((p) => !p.archived);
	const selectedProduct = products.find((p) => p.id === plan.productId);
	const hasCustomizations = plan.isCustom;
	const priceLabel = selectedProduct
		? getPlanPriceLabel({
				product: selectedProduct,
				customItems: plan.items,
				prepaidOptions: plan.prepaidOptions,
			})
		: null;

	const selectedProductIdsInPhase = new Set(
		formValues.phases[phaseIndex]?.plans
			.filter((_, i) => i !== planIndex)
			.map((p) => p.productId)
			.filter(Boolean),
	);

	const handleProductChange = (productId: string) => {
		form.setFieldValue(
			`phases[${phaseIndex}].plans[${planIndex}].productId`,
			productId,
		);
		form.setFieldValue(
			`phases[${phaseIndex}].plans[${planIndex}].prepaidOptions`,
			{},
		);
		form.setFieldValue(`phases[${phaseIndex}].plans[${planIndex}].items`, null);
		form.setFieldValue(
			`phases[${phaseIndex}].plans[${planIndex}].version`,
			undefined,
		);
	};

	const handleEditClick = () => {
		setEditingPlan({ phaseIndex, planIndex });
		setSheet({
			type: "attach-product-v2",
			itemId: plan.productId,
			data: { scheduleEditMode: true },
		});
	};

	if (!plan.productId) {
		return (
			<div className={cn("group relative", isLocked && "opacity-60")}>
				<SearchableSelect
					value={plan.productId || null}
					onValueChange={handleProductChange}
					options={availableProducts}
					getOptionValue={(product) => product.id}
					getOptionLabel={(product) => product.name}
					getOptionDisabled={(product) =>
						usedKeys.has(product.group ?? product.id)
					}
					renderOption={(product) => (
						<>
							<span className="flex-1 truncate min-w-0">{product.name}</span>
							{selectedProductIdsInPhase.has(product.id) && (
								<span className="text-xs text-t4 shrink-0">
									Already selected
								</span>
							)}
							{!selectedProductIdsInPhase.has(product.id) &&
								usedKeys.has(product.group ?? product.id) && (
									<span className="text-xs text-t4 shrink-0">
										Group conflict
									</span>
								)}
						</>
					)}
					placeholder="Select product..."
					searchable
					searchPlaceholder="Search products..."
					emptyText="No products found"
					defaultOpen
					disabled={isLocked}
				/>
			</div>
		);
	}

	const row = (
		<div
			className={cn(
				"group flex h-input min-w-0 w-full items-center gap-2 rounded-lg input-base input-shadow-default px-3 text-sm text-t1",
				isLocked && "opacity-60",
			)}
		>
			{selectedProduct?.is_add_on ? (
				<PuzzlePieceIcon className="size-3.5 shrink-0 text-t3" />
			) : (
				<PackageIcon className="size-3.5 shrink-0 text-t3" />
			)}
			<span className="flex-1 truncate min-w-0">
				{selectedProduct?.name ?? plan.productId}
			</span>
			<div className="relative flex shrink-0 items-center gap-1.5 min-w-[60px] justify-end">
				<div
					className={cn(
						"flex items-center gap-1.5 transition-opacity duration-150",
						!isLocked && "group-hover:opacity-0",
					)}
				>
					{hasCustomizations && (
						<Badge variant="green" size="sm">
							Custom
						</Badge>
					)}
					{priceLabel && (
						<span className="text-xs text-t3 tabular-nums">{priceLabel}</span>
					)}
				</div>
				<div
					className={cn(
						"absolute right-0 flex items-center gap-1 transition-opacity duration-150",
						isLocked ? "opacity-100" : "opacity-0 group-hover:opacity-100",
					)}
				>
					<Button
						variant="ghost"
						size="icon"
						className="h-6 w-6 text-t3 hover:text-t1"
						onClick={handleEditClick}
						disabled={isLocked}
					>
						<PencilSimpleIcon size={13} />
					</Button>
					<button
						type="button"
						className="p-1 text-t4 hover:text-destructive transition-colors disabled:pointer-events-none disabled:opacity-50"
						onClick={() => handleRemovePlan({ phaseIndex, planIndex })}
						disabled={isLocked}
					>
						<XIcon size={13} />
					</button>
				</div>
			</div>
		</div>
	);

	return row;
}

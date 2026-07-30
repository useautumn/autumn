import type { ProductV2, SyncPlanInstance } from "@autumn/shared";
import { Input, SearchableSelect } from "@autumn/ui";
import { useState } from "react";
import {
	PlanEntityScopeSelector,
	PlanScopeToggleButton,
	SelectedPlanRow,
} from "@/components/forms/shared";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { applyCustomizeToProduct, getBasePriceLabel } from "./syncPlanRowUtils";

export type DraftPlan = SyncPlanInstance & { _key: string };

export function SyncPlanRow({
	plan,
	products,
	onChange,
	onRemove,
	onCustomize,
}: {
	plan: DraftPlan;
	products: ProductV2[];
	onChange: (plan: DraftPlan) => void;
	onRemove: () => void;
	onCustomize: () => void;
}) {
	const { features } = useFeaturesQuery();
	const { displayCurrency, productForDisplay } = useCustomerDisplayCurrency();

	const availableProducts = products.filter((p) => !p.archived);
	const selectedProduct = products.find((p) => p.id === plan.plan_id);
	const hasCustomize = Boolean(plan.customize);
	const hasEntityScope = Boolean(plan.entity_id);

	const [scopeOpen, setScopeOpen] = useState<boolean>(hasEntityScope);
	const {
		hasEntities,
		entities,
		isLoading: isEntitiesLoading,
		setSearch: setEntitySearch,
	} = useScopeEntitySearch({ selectedEntityId: plan.entity_id });

	if (!plan.plan_id) {
		return (
			<SearchableSelect
				value={null}
				onValueChange={(value) => onChange({ ...plan, plan_id: value })}
				options={availableProducts}
				getOptionValue={(product) => product.id}
				getOptionLabel={(product) => product.name}
				renderOption={(product) => (
					<span className="flex-1 truncate min-w-0">{product.name}</span>
				)}
				placeholder="Select plan…"
				searchable
				searchPlaceholder="Search plans..."
				emptyText="No plans found"
				defaultOpen
			/>
		);
	}

	const isAddOn = selectedProduct?.is_add_on === true;
	const customizedProduct = selectedProduct
		? applyCustomizeToProduct({
				product: selectedProduct,
				customize: plan.customize,
				features: features ?? [],
			})
		: null;

	const originalPriceLabel = selectedProduct
		? getBasePriceLabel({
				product: productForDisplay(selectedProduct),
				currency: displayCurrency,
			})
		: null;
	const currentPriceLabel = customizedProduct
		? getBasePriceLabel({
				product: productForDisplay(customizedProduct),
				currency: displayCurrency,
			})
		: null;
	const isPriceCustom =
		hasCustomize &&
		originalPriceLabel !== null &&
		currentPriceLabel !== null &&
		originalPriceLabel !== currentPriceLabel;

	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-2">
				<SelectedPlanRow
					productId={plan.plan_id}
					product={customizedProduct ?? selectedProduct}
					isCustom={hasCustomize}
					accessory={
						isAddOn ? (
							<Input
								type="number"
								min={1}
								value={plan.quantity ?? 1}
								onChange={(e) => {
									const next = Number.parseInt(e.target.value, 10);
									onChange({
										...plan,
										quantity: Number.isFinite(next) && next >= 1 ? next : 1,
									});
								}}
								className="w-14 h-7 text-center text-xs"
							/>
						) : undefined
					}
					price={
						currentPriceLabel ? (
							<span
								className={cn(
									"text-xs tabular-nums",
									isPriceCustom
										? "text-emerald-500 font-medium"
										: "text-tertiary-foreground",
								)}
							>
								{currentPriceLabel}
							</span>
						) : undefined
					}
					onEdit={onCustomize}
					onRemove={onRemove}
				/>
				{hasEntities && (
					<PlanScopeToggleButton
						open={scopeOpen}
						onClick={() => setScopeOpen((open) => !open)}
					/>
				)}
			</div>

			{hasEntities && scopeOpen && (
				<div className="ml-4 border-l border-border/40 pl-3">
					<PlanEntityScopeSelector
						entities={entities}
						value={plan.entity_id}
						onChange={(entityId) =>
							onChange({ ...plan, entity_id: entityId ?? undefined })
						}
						showLabel={false}
						wrapInSection={false}
						onSearchChange={setEntitySearch}
						isLoading={isEntitiesLoading}
					/>
				</div>
			)}
		</div>
	);
}

import type { ProductV2, SyncPlanInstance } from "@autumn/shared";
import { Badge, Button, Input, SearchableSelect } from "@autumn/ui";
import {
	PackageIcon,
	PencilSimpleIcon,
	PuzzlePieceIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { applyCustomizeToProduct, getBasePriceLabel } from "./syncPlanRowUtils";

export type DraftPlan = SyncPlanInstance & { _key: string };

const PriceLabel = ({
	label,
	isCustom,
}: {
	label: string;
	isCustom: boolean;
}) => (
	<span
		className={cn(
			"text-xs tabular-nums",
			isCustom ? "text-emerald-500 font-medium" : "text-tertiary-foreground",
		)}
	>
		{label}
	</span>
);

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
			<div
				className={cn(
					"group flex h-input min-w-0 w-full items-center gap-2 rounded-lg",
					"input-base input-shadow-default px-3 text-sm text-foreground",
				)}
			>
				{isAddOn ? (
					<PuzzlePieceIcon className="size-3.5 shrink-0 text-tertiary-foreground" />
				) : (
					<PackageIcon className="size-3.5 shrink-0 text-tertiary-foreground" />
				)}
				<span className="flex-1 truncate min-w-0">
					{selectedProduct?.name ?? plan.plan_id}
				</span>

				{isAddOn && (
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
				)}

				<div className="relative flex shrink-0 items-center gap-1.5 min-w-[60px] justify-end">
					<div
						className={cn(
							"flex items-center gap-1.5 transition-opacity duration-150",
							"group-hover:opacity-0",
						)}
					>
						{hasCustomize && (
							<Badge variant="green" size="sm">
								Custom
							</Badge>
						)}
						{currentPriceLabel && (
							<PriceLabel label={currentPriceLabel} isCustom={isPriceCustom} />
						)}
					</div>
					<div
						className={cn(
							"absolute right-0 flex items-center gap-1 transition-opacity duration-150",
							"opacity-0 group-hover:opacity-100",
						)}
					>
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6 text-tertiary-foreground hover:text-foreground"
							onClick={onCustomize}
						>
							<PencilSimpleIcon size={13} />
						</Button>
						<button
							type="button"
							className="p-1 text-subtle hover:text-destructive transition-colors"
							onClick={onRemove}
						>
							<XIcon size={13} />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

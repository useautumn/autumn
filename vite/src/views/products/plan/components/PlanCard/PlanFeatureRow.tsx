/** biome-ignore-all lint/a11y/noStaticElementInteractions: needed */
/** biome-ignore-all lint/a11y/useSemanticElements: needed */
import type { ProductItem } from "@autumn/shared";
import { getProductItemDisplay } from "@autumn/shared";
import { TrashIcon } from "@phosphor-icons/react";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { getItemId } from "@/utils/product/productItemUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { PlanFeatureIcon } from "./PlanFeatureIcon";

// Custom dot component with bigger height but smaller width
const CustomDotIcon = () => {
	return <div className="w-[2px] h-[2px] mx-0.5 bg-current rounded-full" />;
};

interface PlanFeatureRowProps {
	item: ProductItem;
	onRowClick?: (item: ProductItem) => void;
	onEdit?: (item: ProductItem) => void;
	onDelete?: (item: ProductItem) => void;
	editDisabled?: boolean;
	index?: number;
}

export const PlanFeatureRow = ({
	item,
	onEdit,
	onDelete,
	index,
}: PlanFeatureRowProps) => {
	const { org } = useOrg();
	const { features } = useFeaturesQuery();
	const { editingState } = useProductContext();

	const getDisplayText = (item: ProductItem) => {
		const displayData = getProductItemDisplay({
			item,
			features,
			currency: org?.default_currency || "USD",
		});

		return displayData.primary_text;
	};

	const isSelected = getItemId({ item, itemIndex: index }) === editingState.id;

	return (
		<div
			role="button"
			tabIndex={0}
			className={cn(
				"flex w-full group !h-9 group/row input-base btn-secondary-shadow",
				!isSelected &&
					"hover:!bg-hover-primary focus-visible:!bg-hover-primary focus-visible:!border-primary",
				isSelected &&
					"!bg-active-primary !border-primary !shadow-[0px_0px_0px_0.2px_var(--color-primary)]",
			)}
			onClick={() => onEdit?.(item)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onEdit?.(item);
				}
			}}
		>
			{/* Left side - Icons and text */}
			<div className="flex flex-row items-center flex-1 gap-4 min-w-0">
				<div className="flex flex-row items-center gap-1 flex-shrink-0">
					<PlanFeatureIcon item={item} position="left" />
					<CustomDotIcon />
					<PlanFeatureIcon item={item} position="right" />
				</div>

				<div className="flex items-center gap-2 flex-1 min-w-0">
					<span className="text-t2 font-medium whitespace-nowrap font-inter text-[13px] leading-4 tracking-[-0.003em]">
						{getDisplayText(item)}
					</span>
					<CopyButton
						text={item.feature_id || ""}
						disableActive={true}
						size="sm"
						variant="skeleton"
						className="opacity-0 group-hover:opacity-100 transition-opacity duration-50"
					/>
				</div>
			</div>

			<div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-50">
				<IconButton
					icon={<TrashIcon size={16} weight="regular" />}
					iconOrientation="center"
					onClick={(e) => {
						e.stopPropagation();
						e.preventDefault();
						onDelete?.(item);
					}}
					aria-label="Delete feature"
					variant="skeleton"
					disableActive={true}
				/>

				{/* <div className="group/btn cursor-grab active:cursor-grabbing flex items-center justify-center p-1 w-6 h-6">
					<div className="text-t3 group-hover/btn:text-primary transition-colors">
						<DotsSixVerticalIcon size={16} weight="bold" />
					</div>
				</div> */}
			</div>
		</div>
	);
};

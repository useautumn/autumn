/** biome-ignore-all lint/a11y/noStaticElementInteractions: needed */
/** biome-ignore-all lint/a11y/useSemanticElements: needed */
import type { ProductItem } from "@autumn/shared";
import { getProductItemDisplay } from "@autumn/shared";
import { TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { getItemId } from "@/utils/product/productItemUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { PlanFeatureIcon } from "./PlanFeatureIcon";

// Custom dot component with bigger height but smaller width
const CustomDotIcon = () => {
	return <div className="w-[2px] h-[2px] mx-0.5 bg-current rounded-full" />;
};

interface PlanFeatureRowProps {
	item: ProductItem;
	onDelete?: (item: ProductItem) => void;
	index?: number;
}

export const PlanFeatureRow = ({
	item,
	onDelete,
	index,
}: PlanFeatureRowProps) => {
	const { org } = useOrg();
	const { features } = useFeaturesQuery();
	const { setItem } = useProductItemContext();
	const { editingState, setEditingState, setSheet } = useProductContext();

	const [isPressed, setIsPressed] = useState(false);

	const display = getProductItemDisplay({
		item,
		features,
		currency: org?.default_currency || "USD",
		fullDisplay: true,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});

	const isSelected = getItemId({ item, itemIndex: index }) === editingState.id;

	// useEffect(() => {
	// 	console.log("isSelected", isSelected);
	// }, [isSelected]);

	const handleRowClicked = () => {
		const itemId = getItemId({ item, itemIndex: index });
		setItem(item);
		setEditingState({ type: "feature", id: itemId });
		setSheet("edit-feature");
	};

	return (
		<div
			role="button"
			tabIndex={0}
			data-state={isSelected ? "open" : "closed"}
			data-pressed={isPressed}
			className={cn(
				"flex w-full group !h-9 group/row input-base input-shadow-tiny select-bg select-none",

				// To prevent flickering when clicking inner buttons
				!isSelected &&
					"hover:!bg-hover-primary focus-visible:!bg-hover-primary focus-visible:!border-primary",

				isSelected && "!bg-hover-primary !border-primary",

				// Custom pressed state that we can control
				"data-[pressed=true]:!bg-active-primary data-[pressed=true]:border-primary",
			)}
			onMouseDown={(e) => {
				// Only set pressed if we're not clicking on a button
				if (!(e.target as Element).closest("button")) {
					setIsPressed(true);
				}
			}}
			onMouseUp={() => setIsPressed(false)}
			onMouseLeave={() => setIsPressed(false)}
			onClick={handleRowClicked}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleRowClicked();
				}
			}}
		>
			{/* Left side - Icons and text */}
			<div className="flex flex-row items-center flex-1 gap-4 min-w-0 relative">
				<div className="flex flex-row items-center gap-1 flex-shrink-0">
					<PlanFeatureIcon item={item} position="left" />
					<CustomDotIcon />
					<PlanFeatureIcon item={item} position="right" />
				</div>

				<div className="flex items-center gap-2 flex-1 min-w-0 max-w-[90%] ">
					<p className="whitespace-nowrap truncate max-w-full">
						<span className="text-body">{display.primary_text}</span>
						<span className="text-body-secondary">
							{" "}
							{display.secondary_text}
						</span>
					</p>
				</div>
				<CopyButton
					// hide={true}
					text={item.feature_id || ""}
					disableActive={true}
					size="sm"
					variant="skeleton"
					className="absolute right-0 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-50 bg-hover-primary"
				/>
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

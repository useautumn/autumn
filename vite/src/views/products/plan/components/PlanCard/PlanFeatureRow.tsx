import type { ProductItem } from "@autumn/shared";
import { getProductItemDisplay, ProductItemType } from "@autumn/shared";
import { CurrencyDollar, DotsSixVertical, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getItemType } from "@/utils/product/productItemUtils";
import { PlanFeatureIcon } from "./PlanFeatureIcon";

interface PlanFeatureRowProps {
	item: ProductItem;
	onRowClick?: (item: ProductItem) => void;
	onDelete?: (item: ProductItem) => void;
}

export const PlanFeatureRow = ({
	item,
	onRowClick,
	onDelete,
}: PlanFeatureRowProps) => {
	const { org } = useOrg();
	const { features } = useFeaturesQuery();

	const getDisplayText = (item: ProductItem) => {
		const displayData = getProductItemDisplay({
			item,
			features,
			currency: org?.default_currency || "USD",
		});

		// Combine primary and secondary text
		if ("secondary_text" in displayData && displayData.secondary_text) {
			return `${displayData.primary_text} ${displayData.secondary_text}`;
		}
		return displayData.primary_text;
	};

	const itemType = getItemType(item);
	const showCoinIcon =
		itemType === ProductItemType.Price ||
		itemType === ProductItemType.FeaturePrice;

	// h-[30px] w-full px-[7px] py-[6px] shadow-[0px_4px_4px_rgba(0,0,0,0.02),_inset_0px_-3px_4px_rgba(0,0,0,0.04)]
	return (
		<div className="flex flex-row items-center bg-white border border-[#D1D1D1] form-input gap-1">
			{/* Left side - Icons and text */}
			<div className="flex flex-row items-center flex-1 gap-2 min-w-0">
				{/* Icon container */}
				<div className="flex flex-row items-center gap-1 flex-shrink-0">
					{/* First icon */}
					<PlanFeatureIcon item={item} position="left" />

					{/* Arrow/separator */}
					<div
						className="bg-[#C3C3C3] transform rotate-90"
						style={{
							width: "4.67px",
							height: "3.5px",
							clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
						}}
					/>

					{/* Second icon */}
					<PlanFeatureIcon item={item} position="right" />
				</div>

				{/* Feature text with optional coin icon */}
				<div className="flex items-center gap-2 flex-1 min-w-0">
					{showCoinIcon && (
						<CurrencyDollar
							size={14}
							className="text-[#F59E0B] flex-shrink-0"
							weight="regular"
						/>
					)}
					<span
						className="text-[#444444] font-medium truncate"
						style={{
							fontFamily: "Inter",
							fontSize: "13px",
							lineHeight: "16px",
							letterSpacing: "-0.003em",
						}}
					>
						{getDisplayText(item)}
					</span>
				</div>
			</div>

			{/* Right side - Delete and drag handle */}
			<div className="flex items-center gap-2">
				{/* Delete button */}
				<Button
					variant="ghost"
					size="sm"
					className="rounded-md flex items-center justify-center h-[24px] w-[24px] p-1 hover:bg-red-50 hover:text-red-600"
					onClick={(e) => {
						e.stopPropagation();
						onDelete?.(item);
					}}
				>
					<Trash size={16} className="text-[#666666]" weight="regular" />
				</Button>

				{/* 6-dot drag handle */}
				<div
					className="cursor-grab active:cursor-grabbing p-1"
					style={{ width: "24px", height: "24px" }}
				>
					<DotsSixVertical
						size={16}
						className="text-[#A8A8A8]"
						weight="regular"
					/>
				</div>
			</div>
		</div>
	);
};

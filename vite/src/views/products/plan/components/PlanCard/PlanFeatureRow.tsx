import type { ProductItem } from "@autumn/shared";
import { getProductItemDisplay } from "@autumn/shared";
import {
	DotsSixVerticalIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { HoverClickableIcon } from "@/components/v2/buttons/HoverClickableIcon";
import { FeatureArrowIcon } from "@/components/v2/icons/AutumnIcons";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { PlanFeatureIcon } from "./PlanFeatureIcon";

interface PlanFeatureRowProps {
	item: ProductItem;
	onRowClick?: (item: ProductItem) => void;
	onEdit?: (item: ProductItem) => void;
	onDelete?: (item: ProductItem) => void;
	editDisabled?: boolean;
}

export const PlanFeatureRow = ({
	item,
	onRowClick,
	onEdit,
	onDelete,
	editDisabled,
}: PlanFeatureRowProps) => {
	const { org } = useOrg();
	const { features } = useFeaturesQuery();

	const getDisplayText = (item: ProductItem) => {
		const displayData = getProductItemDisplay({
			item,
			features,
			currency: org?.default_currency || "USD",
		});

		return displayData.primary_text;
	};

	return (
		<div 
			className="group flex flex-row items-center bg-white border border-border rounded-lg h-[30px] w-full px-[7px] py-[6px] gap-1 shadow-[0px_4px_4px_rgba(0,0,0,0.02),_inset_0px_-3px_4px_rgba(0,0,0,0.04)] form-input cursor-pointer hover:bg-muted/30 transition-colors"
			onClick={() => onEdit?.(item)}
		>
			{/* Left side - Icons and text */}
			<div className="flex flex-row items-center flex-1 gap-2 min-w-0">
				{/* Icon container */}
				<div className="flex flex-row items-center gap-1 flex-shrink-0">
					{/* First icon */}
					<PlanFeatureIcon item={item} position="left" />
					<FeatureArrowIcon />
					{/* Second icon */}
					<PlanFeatureIcon item={item} position="right" />
				</div>

				{/* Feature text */}
				<div className="flex items-center gap-2 flex-1 min-w-0">
					<span className="text-t2 font-medium whitespace-nowrap font-inter text-[13px] leading-4 tracking-[-0.003em]">
						{getDisplayText(item)}
					</span>
				</div>
			</div>

			{/* Right side - Edit, Delete and drag handle */}
			<div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
				{/* Edit button */}
				<HoverClickableIcon
					icon={<PencilSimpleIcon size={16} weight="regular" />}
					onClick={(e) => {
						e.stopPropagation();
						onEdit?.(item);
					}}
					disabled={editDisabled}
					aria-label="Edit feature"
				/>

				{/* Delete button */}
				<HoverClickableIcon
					icon={<TrashIcon size={16} weight="regular" />}
					onClick={(e) => {
						e.stopPropagation();
						onDelete?.(item);
					}}
					aria-label="Delete feature"
				/>

				{/* 6-dot drag handle */}
				<div 
					className="group/btn cursor-grab active:cursor-grabbing flex items-center justify-center p-1 w-6 h-6"
					onClick={(e) => e.stopPropagation()}
				>
					<div className="text-t3 group-hover/btn:text-primary transition-colors">
						<DotsSixVerticalIcon size={16} weight="bold" />
					</div>
				</div>
			</div>
		</div>
	);
};

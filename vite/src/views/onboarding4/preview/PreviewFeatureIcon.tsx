import {
	BoxArrowDownIcon,
	MoneyWavyIcon,
	WalletIcon,
} from "@phosphor-icons/react";
import type React from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";
import type { PreviewProductItem } from "./previewTypes";

interface PreviewFeatureIconProps {
	item: PreviewProductItem;
	position: "left" | "right";
	size?: number;
}

type BillingType = "included" | "prepaid" | "paid";

/**
 * Determine billing type from item properties
 */
function getBillingType(item: PreviewProductItem): BillingType {
	if (item.usageModel === "prepaid") {
		return "prepaid";
	}

	if (
		item.usageModel === "pay_per_use" ||
		(item.price != null && item.price > 0)
	) {
		return "paid";
	}

	return "included";
}

/**
 * Get icon for billing type (right position)
 */
function getBillingTypeIcon({
	billingType,
	size,
}: {
	billingType: BillingType;
	size: number;
}): { icon: React.ReactNode; color: string; label: string } {
	const weight = "duotone";

	switch (billingType) {
		case "included":
			return {
				icon: <BoxArrowDownIcon size={size} weight={weight} />,
				color: "text-green-500",
				label: "Included",
			};

		case "prepaid":
			return {
				icon: <WalletIcon size={size} weight={weight} />,
				color: "text-orange-500",
				label: "Prepaid",
			};

		case "paid":
			return {
				icon: <MoneyWavyIcon size={size} weight={weight} />,
				color: "text-yellow-500",
				label: "Usage-based",
			};
	}
}

export function PreviewFeatureIcon({
	item,
	position,
	size = 14,
}: PreviewFeatureIconProps) {
	const iconData =
		position === "left"
			? getFeatureIconConfig(item.featureType, null, size)
			: getBillingTypeIcon({ billingType: getBillingType(item), size });

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className={iconData.color}>{iconData.icon}</div>
			</TooltipTrigger>
			<TooltipContent>{iconData.label}</TooltipContent>
		</Tooltip>
	);
}

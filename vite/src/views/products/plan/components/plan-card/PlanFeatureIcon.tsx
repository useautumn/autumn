import type { ProductItem } from "@autumn/shared";
import { ProductItemFeatureType, UsageModel } from "@autumn/shared";
import {
	BatteryHighIcon,
	BoxArrowDownIcon,
	CoinsIcon,
	PiggyBankIcon,
	PowerIcon,
	TicketIcon,
	XIcon,
} from "@phosphor-icons/react";
import type React from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";

interface PlanFeatureIconProps {
	item: ProductItem;
	position: "left" | "right";
}

// Helper function to classify feature type
const getFeatureType = (item: ProductItem): ProductItemFeatureType | null => {
	return item.feature_type || null;
};

// Helper function to classify billing/usage type
const getBillingType = (
	item: ProductItem,
): "included" | "prepaid" | "paid" | "none" => {
	// Check if it's included/free (no price, no usage model, and no tiers)
	if (
		!item.price &&
		!item.usage_model &&
		!item.price_config &&
		(!item.tiers || item.tiers.length === 0)
	) {
		return "included";
	}

	// Check for prepaid model
	if (item.usage_model === UsageModel.Prepaid) {
		return "prepaid";
	}

	// Check for paid model
	if (
		item.usage_model === UsageModel.PayPerUse ||
		item.price ||
		item.price_config ||
		(item.tiers?.length || 0) > 0
	) {
		return "paid";
	}

	return "none";
};

// Helper function to get the left icon (feature type)
const getLeftIcon = (
	item: ProductItem,
): { icon: React.ReactNode; color: string; size?: number } => {
	const featureType = getFeatureType(item);

	switch (featureType) {
		case ProductItemFeatureType.Boolean:
			return { icon: <PowerIcon />, color: "text-orange-500" }; // On/Off - pink
		case ProductItemFeatureType.SingleUse:
			return { icon: <BatteryHighIcon />, color: "text-red-500" }; // Usage-based - pink
		case ProductItemFeatureType.ContinuousUse:
			return { icon: <TicketIcon />, color: "text-primary" }; // Allocated Usage - pink
		case ProductItemFeatureType.Static:
			return { icon: <PowerIcon />, color: "text-orange-500" }; // Static - pink
		case "metered" as unknown: // Handle metered features from FeatureType enum
			return { icon: <BatteryHighIcon />, color: "text-primary" }; // Metered - pink
		default:
			return { icon: <BatteryHighIcon />, color: "text-primary" }; // Default - pink
	}
};

// Helper function to get the right icon (billing type)
const getRightIcon = (
	item: ProductItem,
): {
	icon: React.ReactNode;
	color: string;
	size?: number;
} => {
	const billingType = getBillingType(item);

	switch (billingType) {
		case "included":
			return { icon: <BoxArrowDownIcon />, color: "text-green-500" }; // Included/Free - green
		case "prepaid":
			return { icon: <PiggyBankIcon />, color: "text-blue-500" }; // Prepaid - blue
		case "paid":
			return { icon: <CoinsIcon />, color: "text-yellow-500" }; // Paid - orange
		case "none":
			return { icon: <XIcon />, color: "text-t4" }; // None - gray
		default:
			return { icon: <XIcon />, color: "text-t4" }; // Default - gray
	}
};

const getTooltipContent = (item: ProductItem, position: "left" | "right") => {
	switch (position) {
		case "left": {
			const ft = getFeatureType(item);
			switch (ft) {
				case ProductItemFeatureType.Boolean:
					return "Boolean";
				case ProductItemFeatureType.SingleUse:
					return "Consumable";
				case ProductItemFeatureType.ContinuousUse:
					return "Non-consumable";
				case ProductItemFeatureType.Static:
					return "Boolean";
				default:
					return null;
			}
		}
		case "right": {
			const bt = getBillingType(item);
			switch (bt) {
				case "included":
					return "Included";
				case "prepaid":
					return "Prepaid";
				case "paid":
					return "Usage-based";
				case "none":
					return "None";
				default:
					return null;
			}
		}
		default:
			return null;
	}
};

export const PlanFeatureIcon = ({ item, position }: PlanFeatureIconProps) => {
	const iconData = position === "left" ? getLeftIcon(item) : getRightIcon(item);
	const icon = iconData.icon as React.ReactNode;

	return getTooltipContent(item, position) !== null ? (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className={iconData.color}>{icon}</div>
			</TooltipTrigger>
			<TooltipContent>{getTooltipContent(item, position)}</TooltipContent>
		</Tooltip>
	) : (
		<div className={iconData.color}>{icon}</div>
	);
};

import type { ProductItem } from "@autumn/shared";
import { ProductItemFeatureType, UsageModel } from "@autumn/shared";
import {
	ArrowsCounterClockwiseIcon,
	CoinsIcon,
	PowerIcon,
} from "@phosphor-icons/react";
import React from "react";
import {
	IncludedUsageIcon,
	PrepaidUsageIcon,
	UsageBasedIcon,
} from "@/components/v2/icons/AutumnIcons";

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
	// Check if it's included/free (no price and no usage model)
	if (!item.price && !item.usage_model && !item.price_config) {
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
		item.price_config
	) {
		return "paid";
	}

	return "none";
};

// Helper function to get the left icon (feature type)
const getLeftIcon = (
	item: ProductItem,
): { icon: React.ComponentType; color: string } => {
	const featureType = getFeatureType(item);

	switch (featureType) {
		case ProductItemFeatureType.Boolean:
			return { icon: PowerIcon, color: "text-primary" }; // On/Off - pink
		case ProductItemFeatureType.SingleUse:
			return { icon: UsageBasedIcon, color: "text-primary" }; // Usage-based - pink
		case ProductItemFeatureType.ContinuousUse:
			return { icon: ArrowsCounterClockwiseIcon, color: "text-primary" }; // Persistent Usage - pink
		case ProductItemFeatureType.Static:
			return { icon: UsageBasedIcon, color: "text-primary" }; // Static - pink
		default:
			console.warn(`Unknown feature type: ${featureType}`);
			return { icon: UsageBasedIcon, color: "text-primary" }; // Default - pink
	}
};

// Helper function to get the right icon (billing type)
const getRightIcon = (
	item: ProductItem,
): { icon: React.ComponentType | typeof CoinsIcon; color: string } => {
	const billingType = getBillingType(item);

	switch (billingType) {
		case "included":
			return { icon: IncludedUsageIcon, color: "text-success" }; // Included/Free - green
		case "prepaid":
			return { icon: PrepaidUsageIcon, color: "text-blue-500" }; // Prepaid - blue
		case "paid":
			return { icon: CoinsIcon, color: "text-warning" }; // Paid - orange
		case "none":
			return { icon: React.Fragment, color: "text-t4" }; // None - gray
		default:
			return { icon: React.Fragment, color: "text-t4" }; // Default - gray
	}
};

export const PlanFeatureIcon = ({ item, position }: PlanFeatureIconProps) => {
	const iconData = position === "left" ? getLeftIcon(item) : getRightIcon(item);
	const Icon = iconData.icon;

	// Handle both Autumn icons (no props) and Phosphor icons (with props)
	if (Icon === React.Fragment) {
		return null;
	}

	// Check if it's a Phosphor icon (has size prop)
	const isPhosphorIcon = Icon === CoinsIcon;

	return (
		<div className={iconData.color}>
			{isPhosphorIcon ? (
				<Icon
					className="!size-3"
					weight={position === "left" ? "bold" : "regular"}
				/>
			) : (
				<Icon className="!size-3" />
			)}
		</div>
	);
};

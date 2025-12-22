import type { Feature, ProductItem } from "@autumn/shared";
import { UsageModel } from "@autumn/shared";
import {
	BankIcon,
	BoxArrowDownIcon,
	MoneyWavyIcon,
	XIcon,
} from "@phosphor-icons/react";
import type React from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";

interface PlanFeatureIconProps {
	item: ProductItem;
	position: "left" | "right";
}

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
// Uses shared getFeatureIconConfig for consistency
const getLeftIcon = (
	item: ProductItem,
	features: Feature[],
): { icon: React.ReactNode; color: string } => {
	// Look up the actual feature to get the correct type (important for credit systems)
	const feature = features.find((f) => f.id === item.feature_id);

	if (feature) {
		const config = getFeatureIconConfig(
			feature.type,
			feature.config?.usage_type,
		);
		return { icon: config.icon, color: config.color };
	}

	// Fallback to item.feature_type if feature not found
	const config = getFeatureIconConfig(item.feature_type);
	return { icon: config.icon, color: config.color };
};

// Helper function to get the right icon (billing type)
const getRightIcon = (
	item: ProductItem,
): {
	icon: React.ReactNode;
	color: string;
} => {
	const billingType = getBillingType(item);
	const size = 16;
	const weight = "duotone";

	switch (billingType) {
		case "included":
			return {
				icon: <BoxArrowDownIcon size={size} weight={weight} />,
				color: "text-green-500",
			}; // Included/Free - green
		case "prepaid":
			return {
				icon: <BankIcon size={size} weight={weight} />,
				color: "text-orange-500",
			}; // Prepaid - blue
		case "paid":
			return {
				icon: <MoneyWavyIcon size={size} weight={weight} />,
				color: "text-yellow-500",
			}; // Paid - orange
		case "none":
			return { icon: <XIcon size={size} weight={weight} />, color: "text-t4" }; // None - gray
		default:
			return { icon: <XIcon size={size} weight={weight} />, color: "text-t4" }; // Default - gray
	}
};

const getTooltipContent = (
	item: ProductItem,
	position: "left" | "right",
	features: Feature[],
) => {
	switch (position) {
		case "left": {
			// Look up the actual feature to get the correct type label
			const feature = features.find((f) => f.id === item.feature_id);
			if (feature) {
				const config = getFeatureIconConfig(
					feature.type,
					feature.config?.usage_type,
				);
				return config.label;
			}
			// Fallback to item.feature_type if feature not found
			const config = getFeatureIconConfig(item.feature_type);
			return config.label;
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
	const { features } = useFeaturesQuery();
	const iconData =
		position === "left" ? getLeftIcon(item, features) : getRightIcon(item);
	const icon = iconData.icon as React.ReactNode;

	return getTooltipContent(item, position, features) !== null ? (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className={iconData.color}>{icon}</div>
			</TooltipTrigger>
			<TooltipContent>
				{getTooltipContent(item, position, features)}
			</TooltipContent>
		</Tooltip>
	) : (
		<div className={iconData.color}>{icon}</div>
	);
};

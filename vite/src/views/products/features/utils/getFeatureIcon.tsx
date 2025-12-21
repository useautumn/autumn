import type { Feature, ProductItem } from "@autumn/shared";
import {
	FeatureType,
	FeatureUsageType,
	ProductItemFeatureType,
} from "@autumn/shared";
import {
	BatteryHighIcon,
	CoinsIcon,
	TicketIcon,
	ToggleRightIcon,
} from "@phosphor-icons/react";
import type React from "react";

/**
 * Icon configuration with icon component, color class, and optional label
 */
export interface FeatureIconConfig {
	icon: React.ReactNode;
	color: string;
	label: string;
}

type FeatureTypeInput =
	| FeatureType
	| ProductItemFeatureType
	| string
	| null
	| undefined;

/**
 * Maps feature type to icon configuration.
 * This is the single source of truth for feature type icons across the app.
 */
export const getFeatureIconConfig = (
	featureType: FeatureTypeInput,
	usageType?: FeatureUsageType | null,
	size = 16,
): FeatureIconConfig => {
	const typeStr = featureType as string;
	const weight = "duotone";
	// Handle continuous use (non-consumable) first
	if (
		typeStr === ProductItemFeatureType.ContinuousUse ||
		typeStr === "continuous_use" ||
		(typeStr === FeatureType.Metered &&
			usageType === FeatureUsageType.Continuous)
	) {
		return {
			icon: <TicketIcon size={size} weight={weight} />,
			color: "text-blue-500",
			label: "Non-consumable",
		};
	}

	// Handle boolean types
	if (
		typeStr === FeatureType.Boolean ||
		typeStr === ProductItemFeatureType.Boolean ||
		typeStr === "boolean" ||
		typeStr === ProductItemFeatureType.Static ||
		typeStr === "static"
	) {
		return {
			icon: <ToggleRightIcon size={size} weight={weight} />,
			color: "text-red-500",
			label: "Boolean",
		};
	}

	// Handle credit system
	if (typeStr === FeatureType.CreditSystem || typeStr === "credit_system") {
		return {
			icon: <CoinsIcon size={size} weight={weight} />,
			color: "text-pink-500",
			label: "Credit System",
		};
	}

	// Handle single use (consumable) - including metered and explicit single use
	if (
		typeStr === FeatureType.Metered ||
		typeStr === "metered" ||
		typeStr === ProductItemFeatureType.SingleUse ||
		typeStr === "single_use"
	) {
		return {
			icon: <BatteryHighIcon size={size} weight={weight} />,
			color: "text-fuchsia-500",
			label: "Consumable",
		};
	}

	// Default fallback
	return {
		icon: <BatteryHighIcon size={size} weight={weight} />,
		color: "text-fuchsia-500",
		label: "Consumable",
	};
};

/**
 * Returns the appropriate icon component for a given feature.
 * Uses getFeatureIconConfig as the single source of truth.
 */
export const getFeatureIcon = ({ feature }: { feature: Feature }) => {
	const config = getFeatureIconConfig(feature.type, feature.config?.usage_type);
	return <span className={config.color}>{config.icon}</span>;
};

/**
 * Returns the appropriate icon component for a product item.
 * Uses getFeatureIconConfig as the single source of truth.
 */
export const getProductItemFeatureIcon = ({ item }: { item: ProductItem }) => {
	const config = getFeatureIconConfig(item.feature_type);
	return <span className={config.color}>{config.icon}</span>;
};

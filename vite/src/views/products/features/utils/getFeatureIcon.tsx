import type { Feature, ProductItem } from "@autumn/shared";
import {
	FeatureType,
	FeatureUsageType,
	isAiCreditSystem,
	ProductItemFeatureType,
} from "@autumn/shared";
import type { StatusGlyph, StatusTone } from "@autumn/ui";
import {
	BatteryHighIcon,
	CoinsIcon,
	CpuIcon,
	TicketIcon,
	ToggleRightIcon,
} from "@phosphor-icons/react";
import type React from "react";

interface FeatureIconConfig {
	icon: React.ReactNode;
	color: string;
	label: string;
	tone: StatusTone;
	glyph: StatusGlyph;
}

type FeatureTypeInput =
	| FeatureType
	| ProductItemFeatureType
	| string
	| null
	| undefined;

export const getFeatureIconConfig = (
	featureType: FeatureTypeInput,
	usageType?: FeatureUsageType | null,
	size = 16,
): FeatureIconConfig => {
	const typeStr = featureType as string;
	const weight = "duotone";
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
			tone: "blue",
			glyph: "ticket",
		};
	}

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
			tone: "red",
			glyph: "toggle",
		};
	}

	if (isAiCreditSystem(typeStr) || typeStr === "ai_credit_system") {
		return {
			icon: <CpuIcon size={size} weight={weight} />,
			color: "text-yellow-500",
			label: "AI Credit System",
			tone: "yellow",
			glyph: "cpu",
		};
	}

	if (typeStr === FeatureType.CreditSystem || typeStr === "credit_system") {
		return {
			icon: <CoinsIcon size={size} weight={weight} />,
			color: "text-pink-500",
			label: "Credit System",
			tone: "pink",
			glyph: "coins",
		};
	}

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
			tone: "fuchsia",
			glyph: "battery",
		};
	}

	return {
		icon: <BatteryHighIcon size={size} weight={weight} />,
		color: "text-fuchsia-500",
		label: "Consumable",
		tone: "fuchsia",
		glyph: "battery",
	};
};

export const getFeatureIcon = ({
	feature,
	size = 16,
}: {
	feature: Feature;
	size?: number;
}) => {
	const config = getFeatureIconConfig(
		feature.type,
		feature.config?.usage_type,
		size,
	);
	return <span className={config.color}>{config.icon}</span>;
};

const getProductItemFeatureIcon = ({ item }: { item: ProductItem }) => {
	const config = getFeatureIconConfig(item.feature_type);
	return <span className={config.color}>{config.icon}</span>;
};

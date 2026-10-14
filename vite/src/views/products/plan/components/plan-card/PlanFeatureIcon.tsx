import type { Feature, ProductItem } from "@autumn/shared";
import { UsageModel } from "@autumn/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import {
	BoxArrowDownIcon,
	MoneyWavyIcon,
	WalletIcon,
	XIcon,
} from "@phosphor-icons/react";
import type React from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";

interface PlanFeatureIconProps {
	item: ProductItem;
	position: "left" | "right";
}

const getBillingType = (
	item: ProductItem,
): "included" | "prepaid" | "paid" | "none" => {
	if (
		!item.price &&
		!item.usage_model &&
		(!item.tiers || item.tiers.length === 0)
	) {
		return "included";
	}

	if (item.usage_model === UsageModel.Prepaid) {
		return "prepaid";
	}

	if (
		item.usage_model === UsageModel.PayPerUse ||
		item.price ||
		(item.tiers?.length || 0) > 0
	) {
		return "paid";
	}

	return "none";
};

const getLeftIcon = (
	item: ProductItem,
	features: Feature[],
): { icon: React.ReactNode; color: string } => {
	const feature = features.find((f) => f.id === item.feature_id);

	if (feature) {
		const config = getFeatureIconConfig(
			feature.type,
			feature.config?.usage_type,
		);
		return { icon: config.icon, color: config.color };
	}

	const config = getFeatureIconConfig(item.feature_type);
	return { icon: config.icon, color: config.color };
};

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
			};
		case "prepaid":
			return {
				icon: <WalletIcon size={size} weight={weight} />,
				color: "text-orange-500",
			};
		case "paid":
			return {
				icon: <MoneyWavyIcon size={size} weight={weight} />,
				color: "text-yellow-500",
			};
		case "none":
			return {
				icon: <XIcon size={size} weight={weight} />,
				color: "text-subtle",
			};
		default:
			return {
				icon: <XIcon size={size} weight={weight} />,
				color: "text-subtle",
			};
	}
};

const getTooltipContent = (
	item: ProductItem,
	position: "left" | "right",
	features: Feature[],
) => {
	switch (position) {
		case "left": {
			const feature = features.find((f) => f.id === item.feature_id);
			if (feature) {
				const config = getFeatureIconConfig(
					feature.type,
					feature.config?.usage_type,
				);
				return config.label;
			}
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

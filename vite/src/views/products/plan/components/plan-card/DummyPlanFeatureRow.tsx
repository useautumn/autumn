import { FeatureType, FeatureUsageType } from "@autumn/shared";
import { BoxArrowDownIcon } from "@phosphor-icons/react";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { cn } from "@/lib/utils";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";
import { CustomDotIcon } from "./PlanFeatureRow";

/**
 * Displays a preview row in the plan card for a feature being created.
 * Updates dynamically as the user types in the feature name field.
 */
export const DummyPlanFeatureRow = () => {
	const feature = useFeatureStore((s) => s.feature);

	const featureName = feature.name?.trim() || "";
	const hasName = featureName.length > 0;
	const featureType = feature.type;
	const usageType = feature.config?.usage_type;

	// Get left icon based on feature type using shared config
	const iconConfig = getFeatureIconConfig(featureType, usageType);
	const getLeftIcon = () => {
		return <span className={iconConfig.color}>{iconConfig.icon}</span>;
	};

	// Right icon is always "included" since new features have no pricing
	const getRightIcon = () => {
		return (
			<BoxArrowDownIcon size={16} weight="duotone" className="text-green-500" />
		);
	};

	// Determine feature type for placeholder logic
	const isBoolean = featureType === FeatureType.Boolean;
	const isNonConsumable =
		featureType === FeatureType.Metered &&
		usageType === FeatureUsageType.Continuous;

	// Get placeholder name based on feature type
	const getPlaceholderName = () => {
		if (featureType === FeatureType.CreditSystem) return "Credits";
		if (isBoolean) return "Premium Analytics";
		if (isNonConsumable) return "Seats";
		return "Chat Messages";
	};

	// Build display text based on feature type
	const getDisplayText = () => {
		const name = hasName ? featureName : getPlaceholderName();

		if (featureType === FeatureType.CreditSystem) {
			return { primary: `100 ${name}`, secondary: "" };
		}

		if (isBoolean) {
			return { primary: name, secondary: "" };
		}

		if (isNonConsumable) {
			return { primary: `10 ${name}`, secondary: "" };
		}

		// Default to consumable format (metered single use)
		return { primary: `10 ${name}`, secondary: "per month" };
	};

	const displayText = getDisplayText();

	return (
		<div
			className={cn(
				"flex items-center w-full h-10! select-none rounded-xl",
				"input-base",
				"border-primary! !border-dashed bg-interative-secondary outline-4! outline-outer-background!",
				"pointer-events-none cursor-default",
				"relative z-60",
			)}
		>
			{/* Left side - Icons and text */}
			<div className="flex flex-row items-center flex-1 gap-2 min-w-0 overflow-hidden">
				<div className="flex flex-row items-center gap-1 shrink-0">
					{getLeftIcon()}
					<CustomDotIcon />
					{getRightIcon()}
				</div>

				<p className="whitespace-nowrap truncate flex-1 min-w-0">
					<span className="text-body-secondary">eg, </span>
					<span className={cn("text-body", !hasName && "text-t4!")}>
						{displayText.primary}
					</span>
					{displayText.secondary && (
						<span className="text-body-secondary">
							{" "}
							{displayText.secondary}
						</span>
					)}
				</p>
			</div>
		</div>
	);
};

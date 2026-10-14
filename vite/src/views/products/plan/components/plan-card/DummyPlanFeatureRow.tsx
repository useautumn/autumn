import {
	FeatureType,
	FeatureUsageType,
	isAnyCreditSystem,
} from "@autumn/shared";
import { BoxArrowDownIcon } from "@phosphor-icons/react";
import { CustomDotIcon } from "@/components/v2/PlanItemLabel";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { cn } from "@/lib/utils";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";

export const DummyPlanFeatureRow = () => {
	const feature = useFeatureStore((s) => s.feature);

	const featureName = feature.name?.trim() || "";
	const hasName = featureName.length > 0;
	const featureType = feature.type;
	const usageType = feature.config?.usage_type;

	const iconConfig = getFeatureIconConfig(featureType, usageType);
	const getLeftIcon = () => {
		return <span className={iconConfig.color}>{iconConfig.icon}</span>;
	};

	const getRightIcon = () => {
		return (
			<BoxArrowDownIcon size={16} weight="duotone" className="text-green-500" />
		);
	};

	const isBoolean = featureType === FeatureType.Boolean;
	const isNonConsumable =
		featureType === FeatureType.Metered &&
		usageType === FeatureUsageType.Continuous;

	const getPlaceholderName = () => {
		if (isAnyCreditSystem(featureType)) return "Credits";
		if (isBoolean) return "Premium Analytics";
		if (isNonConsumable) return "Seats";
		return "Chat Messages";
	};

	const getDisplayText = () => {
		const name = hasName ? featureName : getPlaceholderName();

		if (isAnyCreditSystem(featureType)) {
			return { primary: `100 ${name}`, secondary: "" };
		}

		if (isBoolean) {
			return { primary: name, secondary: "" };
		}

		if (isNonConsumable) {
			return { primary: `10 ${name}`, secondary: "" };
		}

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
			<div className="flex flex-row items-center flex-1 gap-2 min-w-0 overflow-hidden">
				<div className="flex flex-row items-center gap-1 shrink-0">
					{getLeftIcon()}
					<CustomDotIcon />
					{getRightIcon()}
				</div>

				<p className="whitespace-nowrap truncate flex-1 min-w-0">
					<span className="text-body-secondary">eg, </span>
					<span className={cn("text-body", !hasName && "text-subtle!")}>
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

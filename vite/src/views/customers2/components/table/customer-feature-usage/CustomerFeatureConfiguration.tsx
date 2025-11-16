import { type Feature, FeatureType, FeatureUsageType } from "@autumn/shared";
import {
	BooleanIcon,
	CoinsIcon,
	ContinuousUseIcon,
	UsageBasedIcon,
} from "@/components/v2/icons/AutumnIcons";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";

interface CustomerFeatureConfigurationProps {
	feature: Feature | undefined;
}

const FeatureIcon = ({ feature }: { feature: Feature }) => {
	const iconClassName = "text-gray-600 dark:text-gray-400";

	switch (feature.type) {
		case FeatureType.Boolean:
			return <BooleanIcon className={iconClassName} />;
		case FeatureType.Metered:
			if (feature?.config?.usage_type === FeatureUsageType.Continuous) {
				return <ContinuousUseIcon className={iconClassName} />;
			}
			return <UsageBasedIcon className={iconClassName} />;
		case FeatureType.CreditSystem:
			return <CoinsIcon className={iconClassName} />;
		default:
			return <UsageBasedIcon className={iconClassName} />;
	}
};

const FeatureTypeLabel = ({ type }: { type: FeatureType }) => {
	switch (type) {
		case FeatureType.Boolean:
			return "Boolean";
		case FeatureType.Metered:
			return "Metered";
		case FeatureType.CreditSystem:
			return "Credit System";
		default:
			return "Feature";
	}
};

export function CustomerFeatureConfiguration({
	feature,
}: CustomerFeatureConfigurationProps) {
	if (!feature) {
		return <div>-</div>;
	}

	return (
		<div>
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="inline-flex items-center justify-center size-6 rounded-lg bg-muted">
						<FeatureIcon feature={feature} />
					</span>
				</TooltipTrigger>
				<TooltipContent>
					<FeatureTypeLabel type={feature.type} />
				</TooltipContent>
			</Tooltip>
		</div>
	);
}

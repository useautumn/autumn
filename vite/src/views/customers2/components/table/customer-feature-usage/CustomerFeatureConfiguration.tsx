import { type Feature, FeatureType } from "@autumn/shared";
import {
	BooleanIcon,
	CoinsIcon,
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

const FeatureIcon = ({ type }: { type: FeatureType }) => {
	const iconClassName = "text-gray-600 dark:text-gray-400";

	switch (type) {
		case FeatureType.Boolean:
			return <BooleanIcon className={iconClassName} />;
		case FeatureType.Metered:
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
					<span className="inline-flex items-center justify-center size-6 rounded-lg bg-gray-100 dark:bg-gray-800">
						<FeatureIcon type={feature.type} />
					</span>
				</TooltipTrigger>
				<TooltipContent>
					<FeatureTypeLabel type={feature.type} />
				</TooltipContent>
			</Tooltip>
		</div>
	);
}

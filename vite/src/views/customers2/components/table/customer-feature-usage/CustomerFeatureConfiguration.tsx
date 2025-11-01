import { FeatureType } from "@autumn/shared";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";

interface CustomerFeatureConfigurationProps {
	feature: any;
}

const getFeatureTypeLabel = (type: FeatureType): string => {
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
					<span className="inline-flex">{getFeatureIcon({ feature })}</span>
				</TooltipTrigger>
				<TooltipContent>{getFeatureTypeLabel(feature.type)}</TooltipContent>
			</Tooltip>
		</div>
	);
}

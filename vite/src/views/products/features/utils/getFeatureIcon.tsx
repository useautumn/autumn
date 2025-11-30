import type { Feature } from "@autumn/shared";
import { FeatureType, FeatureUsageType } from "@autumn/shared";
import {
	BooleanIcon,
	CoinsIcon,
	ContinuousUseIcon,
	UsageBasedIcon,
} from "@/components/v2/icons/AutumnIcons";

/**
 * Returns the appropriate icon component for a given feature type
 */
export const getFeatureIcon = ({ feature }: { feature: Feature }) => {
	switch (feature.type) {
		case FeatureType.Boolean:
			return <BooleanIcon />;
		case FeatureType.Metered:
			if (feature.config?.usage_type === FeatureUsageType.Continuous) {
				return <ContinuousUseIcon />;
			}
			return <UsageBasedIcon />;
		case FeatureType.CreditSystem:
			return <CoinsIcon />;
		default:
			return <UsageBasedIcon />;
	}
};

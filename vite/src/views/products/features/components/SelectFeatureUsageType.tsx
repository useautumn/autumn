import {
	ApiFeatureType,
	type CreateFeature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { Clock, Zap } from "lucide-react";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { SelectType } from "@/components/general/SelectType";
import { defaultMeteredConfig } from "../utils/defaultFeatureConfig";

export const SelectFeatureUsageType = ({
	feature,
	setFeature,
}: {
	feature: CreateFeature;
	setFeature: any;
}) => {
	const featureType = feature.type;
	const usageType = feature.usage_type;

	const setFeatureType = (type: ApiFeatureType) => {
		// 1. If type is boolean
		if (type === ApiFeatureType.Boolean) {
			setFeature({
				...feature,
				type: ApiFeatureType.Boolean,
				config: undefined,
				usage_type: null,
			});
		} else {
			setFeature({
				...feature,
				type: FeatureType.Metered,
				usage_type: type,
				config: { ...defaultMeteredConfig },
			});
		}
	};
	return (
		<div className="flex flex-col">
			<FieldLabel>Usage Type</FieldLabel>
			<div className="grid grid-cols-2 gap-2">
				<SelectType
					title="Single"
					description="Features that are consumed and refilled like 'credits' or 'tokens'"
					icon={<Zap className="text-t3" size={12} />}
					isSelected={
						featureType === FeatureType.Metered &&
						usageType === FeatureUsageType.SingleUse
					}
					onClick={() => setFeatureType(ApiFeatureType.SingleUsage)}
				/>
				<SelectType
					title="Continuous"
					description="Features used on an ongoing basis, like 'seats' or 'storage'"
					icon={<Clock className="text-t3" size={12} />}
					isSelected={
						featureType === FeatureType.Metered &&
						usageType === FeatureUsageType.ContinuousUse
					}
					onClick={() => setFeatureType(ApiFeatureType.ContinuousUse)}
				/>
				{/* <SelectType
          title="Boolean"
          description="Features that are either enabled or disabled, like 'premium models'"
          icon={<ToggleLeft className="h-3 w-3 text-t3" />}
          isSelected={featureType === FeatureType.Boolean}
          onClick={() => setFeatureType(ApiFeatureType.Boolean)}
        /> */}
			</div>
		</div>
	);
};

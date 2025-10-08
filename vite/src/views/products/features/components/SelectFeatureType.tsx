import {
	ApiFeatureType,
	type CreateFeature,
	FeatureType,
} from "@autumn/shared";
import { ArrowUp01, Flag } from "lucide-react";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { SelectType } from "@/components/general/SelectType";
import { defaultMeteredConfig } from "../utils/defaultFeatureConfig";

export const SelectFeatureType = ({
	feature,
	setFeature,
}: {
	feature: CreateFeature;
	setFeature: any;
}) => {
	const featureType = feature.type;
	const usageType = feature.config?.usage_type;

	const setFeatureType = (type: ApiFeatureType) => {
		// 1. If type is boolean
		if (type === ApiFeatureType.Boolean) {
			setFeature({
				...feature,
				type: ApiFeatureType.Boolean,
				config: undefined,
			});
		} else {
			setFeature({
				...feature,
				type: FeatureType.Metered,
				config: { ...defaultMeteredConfig, usage_type: type },
			});
		}
	};
	return (
		<div className="flex flex-col">
			<FieldLabel>Feature Type</FieldLabel>
			<div className="grid grid-cols-2 gap-2">
				<SelectType
					title="Metered"
					description="A usage-based feature that you want to track"
					icon={<ArrowUp01 className="text-t3" size={13} />}
					isSelected={featureType === FeatureType.Metered}
					onClick={() => {
						const curConfig = feature.config;
						setFeature({
							...feature,
							type: FeatureType.Metered,
							config: {
								...defaultMeteredConfig,
								usage_type: curConfig?.usage_type ?? null,
							},
						});
					}}
				/>
				<SelectType
					title="Boolean"
					description="A feature flag that can be either enabled or disabled"
					icon={<Flag className="text-t3" size={12} />}
					isSelected={featureType === FeatureType.Boolean}
					onClick={() =>
						setFeature({
							...feature,
							type: FeatureType.Boolean,
							config: undefined,
						})
					}
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

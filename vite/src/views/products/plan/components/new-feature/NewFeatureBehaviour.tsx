import {
	type CreateFeature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { AreaRadioGroupItem } from "@/components/v2/radio-groups/AreaRadioGroupItem";
import { RadioGroup } from "@/components/v2/radio-groups/RadioGroup";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";

export function NewFeatureBehaviour({
	feature,
	setFeature,
}: {
	feature: CreateFeature;
	setFeature: (feature: CreateFeature) => void;
}) {
	if (feature.type && feature.type !== FeatureType.Boolean) {
		console.log("feature.config?.usage_type", feature);
		return (
			<SheetSection>
				<RadioGroup
					value={feature.config?.usage_type || FeatureUsageType.Single}
					onValueChange={(value) => {
						setFeature({
							...feature,
							config: {
								...feature.config,
								usage_type: value as FeatureUsageType,
							},
						});
					}}
					className="space-y-0"
				>
					<AreaRadioGroupItem
						value={FeatureUsageType.Single}
						label="Consumable"
						description="Usage can reset periodically (eg messages, video minutes)"
					/>
					<AreaRadioGroupItem
						value={FeatureUsageType.Continuous}
						label="Non-consumable"
						description="Usage is persistent and never resets (eg seats, storage)"
					/>
				</RadioGroup>
			</SheetSection>
		);
	}
}

import {
	type CreateFeature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import {
	RadioGroup,
	RadioGroupItem,
} from "@/components/v2/radio-groups/RadioGroup";
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
				<div className="space-y-4">
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
						className="space-y-4"
					>
						<div className="flex w-full gap-2">
							<RadioGroupItem
								value={FeatureUsageType.Single}
								className="mt-1"
							/>
							<div className="flex-1">
								<div className="text-body-highlight mb-1 flex-row flex items-center gap-1">
									Consumable
								</div>
								<div className="text-body-secondary leading-tight">
									Usage can reset periodically (eg messages, video minutes)
								</div>
							</div>
						</div>

						<div className="flex w-full gap-2">
							<RadioGroupItem
								value={FeatureUsageType.Continuous}
								className="mt-1"
							/>
							<div className="flex-1">
								<div className="text-body-highlight mb-1 flex-row flex items-center gap-1">
									Non-consumable
								</div>
								<div className="text-body-secondary leading-tight">
									Usage is persistent and never resets (eg seats, storage)
								</div>
							</div>
						</div>
					</RadioGroup>
				</div>
			</SheetSection>
		);
	}
}

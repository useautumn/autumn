import type { CreateFeature } from "@autumn/shared";
import { NewFeatureAdvanced } from "@/views/products/plan/components/new-feature/NewFeatureAdvanced";
import { NewFeatureBehaviour } from "@/views/products/plan/components/new-feature/NewFeatureBehaviour";
import { NewFeatureDetails } from "../../products/plan/components/new-feature/NewFeatureDetails";
import { NewFeatureType } from "../../products/plan/components/new-feature/NewFeatureType";

interface FeatureCreationStepProps {
	feature: CreateFeature;
	setFeature: (feature: CreateFeature) => void;
}

export const FeatureCreationStep = ({
	feature,
	setFeature,
}: FeatureCreationStepProps) => {
	return (
		<div className="flex flex-col h-full">
			<NewFeatureDetails feature={feature} setFeature={setFeature} />

			<NewFeatureType feature={feature} setFeature={setFeature} />

			<NewFeatureBehaviour feature={feature} setFeature={setFeature} />

			<NewFeatureAdvanced feature={feature} setFeature={setFeature} />
		</div>
	);
};

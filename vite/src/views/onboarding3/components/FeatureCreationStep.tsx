import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { NewFeatureAdvanced } from "@/views/products/plan/components/new-feature/NewFeatureAdvanced";
import { NewFeatureBehaviour } from "@/views/products/plan/components/new-feature/NewFeatureBehaviour";
import { NewFeatureDetails } from "../../products/plan/components/new-feature/NewFeatureDetails";
import { NewFeatureType } from "../../products/plan/components/new-feature/NewFeatureType";
import { useOnboardingStore } from "../store/useOnboardingStore";

export const FeatureCreationStep = () => {
	const feature = useFeatureStore((s) => s.feature);
	const setFeature = useFeatureStore((s) => s.setFeature);
	const isOnboarding = useOnboardingStore((s) => s.isOnboarding);

	return (
		<div className="flex flex-col h-full">
			<NewFeatureDetails feature={feature} setFeature={setFeature} />

			<NewFeatureType
				feature={feature}
				setFeature={setFeature}
				isOnboarding={isOnboarding}
			/>

			<NewFeatureBehaviour feature={feature} setFeature={setFeature} />

			<NewFeatureAdvanced feature={feature} setFeature={setFeature} />
		</div>
	);
};

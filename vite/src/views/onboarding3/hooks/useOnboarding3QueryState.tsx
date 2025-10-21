import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { OnboardingStep } from "../utils/onboardingUtils";

export const useOnboarding3QueryState = () => {
	const [queryStates, setQueryStates] = useQueryStates(
		{
			step: parseAsStringLiteral([
				OnboardingStep.PlanDetails,
				OnboardingStep.FeatureCreation,
				OnboardingStep.FeatureConfiguration,
				OnboardingStep.Playground,
				OnboardingStep.Integration,
			] as const).withDefault(OnboardingStep.PlanDetails),
			product_id: parseAsString,
			m: parseAsStringLiteral(["e", "p"] as const),
		},
		{
			history: "push",
		},
	);

	return { queryStates, setQueryStates };
};

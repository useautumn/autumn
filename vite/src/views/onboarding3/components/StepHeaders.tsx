import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { useOnboarding3QueryState } from "../hooks/useOnboarding3QueryState";
import {
	getStepNumber,
	OnboardingStep,
	stepConfig,
} from "../utils/onboardingUtils";
import { PlaygroundToolbar } from "./playground-step/PlaygroundToolbar";

export const StepHeader = () => {
	// Get step from query state
	const { queryStates } = useOnboarding3QueryState();
	const step = queryStates.step;

	const stepNum = getStepNumber(step);
	const config = stepConfig[step];

	if (step === OnboardingStep.Playground) {
		return (
			<div className="flex flex-col gap-2">
				<SheetHeader
					title={`Step ${stepNum}: ${config.title}`}
					description={config.description}
					noSeparator={true}
					className="p-0 sticky"
					isOnboarding={true}
				/>
				<PlaygroundToolbar />
			</div>
		);
	}

	return (
		<SheetHeader
			title={`Step ${stepNum}: ${config.title}`}
			description={config.description}
			noSeparator={true}
			className="p-0 sticky"
			isOnboarding={true}
		/>
	);
};

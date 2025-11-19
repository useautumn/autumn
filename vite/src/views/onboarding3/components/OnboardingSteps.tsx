import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { cn } from "@/lib/utils";
import { useOnboarding3QueryState } from "../hooks/useOnboarding3QueryState";
import { useOnboardingStore } from "../store/useOnboardingStore";
import { getStepNumber } from "../utils/onboardingUtils";

interface OnboardingStepsProps {
	className?: string;
}

export const OnboardingSteps = ({ className }: OnboardingStepsProps) => {
	// Get product and feature for validation
	const product = useProductStore((s) => s.product);
	const feature = useFeatureStore((state) => state.feature);

	// Get step from query state
	const { queryStates } = useOnboarding3QueryState();
	const step = queryStates.step;

	// Get handlers and state from store
	const isButtonLoading = useOnboardingStore((state) => state.isButtonLoading);
	const handleNext = useOnboardingStore((state) => state.handleNext);
	const handleBack = useOnboardingStore((state) => state.handleBack);
	const validateStep = useOnboardingStore((state) => state.validateStep);

	const currentStep = getStepNumber(step);
	const totalSteps = 5;
	const nextDisabled = !validateStep?.(step, product, feature);
	const backDisabled = currentStep === 1;
	const nextText = currentStep >= 5 ? "Go to Dashboard" : "Next";

	return (
		<div
			className={cn(
				"flex items-center justify-between gap-1 w-full",
				className,
			)}
		>
			<div className="self-stretch w-full h-6 px-2.5 py-3 bg-interactive-secondary rounded-lg shadow-[inset_0px_-3px_4px_0px_rgba(0,0,0,0.04)] outline-1 outline-offset-[-1px] outline-border inline-flex justify-start items-center gap-1">
				{Array.from({ length: totalSteps }).map((_, index) => {
					const isCompleted = index < currentStep;
					return (
						<div
							key={index}
							className={cn(
								"flex-1 h-1.5 rounded-sm",
								isCompleted
									? "bg-violet-600"
									: "bg-white shadow-[inset_0px_2px_1px_0px_rgba(0,0,0,0.07)] border border-stone-300",
							)}
						/>
					);
				})}
			</div>
			{/* Navigation buttons */}
			<div className="flex items-center gap-1.5 flex-shrink-0">
				<ShortcutButton
					variant="secondary"
					onClick={handleBack || undefined}
					disabled={backDisabled || !handleBack}
					size="sm"
					className="min-w-24 px-2 text-xs outline-1"
					metaShortcut="backspace"
				>
					Back
				</ShortcutButton>
				<ShortcutButton
					variant="primary"
					onClick={handleNext || undefined}
					disabled={nextDisabled || isButtonLoading || !handleNext}
					size="sm"
					className="min-w-24 px-2 text-xs"
					metaShortcut="enter"
					isLoading={isButtonLoading}
				>
					{nextText}
				</ShortcutButton>
			</div>
		</div>
	);
};

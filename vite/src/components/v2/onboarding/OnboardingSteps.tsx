import { Button } from "@/components/v2/buttons/Button";
import { cn } from "@/lib/utils";

interface OnboardingStepsProps {
	totalSteps: number;
	currentStep: number;
	onNext?: () => void;
	onBack?: () => void;
	onComplete?: () => void;
	nextDisabled?: boolean;
	backDisabled?: boolean;
	nextText?: string;
	backText?: string;
	className?: string;
}

export const OnboardingSteps = ({
	totalSteps,
	currentStep,
	onNext,
	onBack,
	nextDisabled = false,
	backDisabled = false,
	nextText = "Next",
	backText = "Back",
	className,
	onComplete,
}: OnboardingStepsProps) => {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-2 w-full",
				className,
			)}
		>
			{/* Step indicators */}
			<div className="flex items-center gap-1 bg-white rounded-full px-2 py-1.5 border border-gray-200 shadow-sm flex-shrink-0">
				{Array.from({ length: totalSteps }, (_, index) => (
					<div
						key={index}
						className={cn(
							"h-1.5 w-6 rounded-full transition-colors duration-200",
							index < currentStep
								? "bg-primary" // Purple for completed steps
								: "bg-gray-200", // Gray for incomplete steps
						)}
					/>
				))}
			</div>

			{/* Navigation buttons */}
			<div className="flex items-center gap-1.5 flex-shrink-0">
				<Button
					variant="secondary"
					onClick={onBack}
					disabled={backDisabled}
					size="sm"
					className="min-w-12 px-2 text-xs"
				>
					{backText}
				</Button>
				<Button
					variant="primary"
					onClick={currentStep === totalSteps ? onComplete : onNext}
					disabled={nextDisabled}
					size="sm"
					className="min-w-12 px-2 text-xs"
				>
					{nextText}
				</Button>
			</div>
		</div>
	);
};

import { Loader2 } from "lucide-react";
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
	isLoading?: boolean;
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
	isLoading = false,
}: OnboardingStepsProps) => {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-1 w-full",
				className,
			)}
		>
			<div className="self-stretch w-full h-6 px-2.5 py-3 bg-white rounded-lg shadow-[inset_0px_-3px_4px_0px_rgba(0,0,0,0.04)] outline-1 outline-offset-[-1px] outline-[#ddd] inline-flex justify-start items-center gap-1">
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
				<Button
					variant="secondary"
					onClick={onBack}
					disabled={backDisabled}
					size="sm"
					className="min-w-24 px-2 text-xs outline-1"
				>
					{backText}
				</Button>
				<Button
					variant="primary"
					onClick={currentStep === totalSteps ? onComplete : onNext}
					disabled={nextDisabled || isLoading}
					size="sm"
					className="min-w-24 px-2 text-xs"
				>
					{isLoading && (currentStep === 1 || currentStep === 2) ? (
						<Loader2 className="size-3 animate-spin" />
					) : (
						nextText
					)}
				</Button>
			</div>
		</div>
	);
};

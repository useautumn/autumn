import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface StepperStep {
	key: string;
	label: string;
}

/**
 * Horizontal numbered stepper with forward visibility — current step
 * highlighted, completed steps checked, upcoming steps dimmed.
 */
export function Stepper({
	steps,
	currentKey,
}: {
	steps: StepperStep[];
	currentKey: string;
}) {
	const currentIndex = steps.findIndex((s) => s.key === currentKey);

	return (
		<div className="flex items-center gap-2.5">
			{steps.map((step, index) => {
				const current = index === currentIndex;
				const isComplete = index < currentIndex;
				return (
					<div key={step.key} className="flex items-center gap-2.5">
						<div className="flex items-center gap-2">
							<span
								className={cn(
									"flex items-center justify-center size-[18px] rounded-full text-[10px] font-semibold tabular-nums transition-colors duration-200 shrink-0",
									current && "bg-foreground text-background",
									isComplete && "bg-foreground/10 text-foreground",
									!current && !isComplete && "bg-transparent text-tertiary-foreground ring-1 ring-inset ring-border",
								)}
							>
								{isComplete ? <CheckIcon size={10} weight="bold" /> : index + 1}
							</span>
							<span
								className={cn(
									"text-[13px] transition-colors duration-200 whitespace-nowrap",
									current
										? "text-foreground font-medium"
										: "text-tertiary-foreground",
								)}
							>
								{step.label}
							</span>
						</div>
						{index < steps.length - 1 && (
							<div className="h-px w-5 bg-border" />
						)}
					</div>
				);
			})}
		</div>
	);
}

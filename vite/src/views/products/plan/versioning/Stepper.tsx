import { CaretRightIcon, type Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface StepperStep {
	key: string;
	label: string;
	icon: Icon;
}

/**
 * Horizontal icon stepper — current step highlighted, completed steps
 * clickable to navigate back, upcoming steps dimmed.
 */
export function Stepper({
	steps,
	currentKey,
	onStepSelect,
}: {
	steps: StepperStep[];
	currentKey: string;
	onStepSelect?: (key: string) => void;
}) {
	const currentIndex = steps.findIndex((s) => s.key === currentKey);

	return (
		<div className="flex items-center gap-2">
			{steps.map((step, index) => {
				const isCurrent = index === currentIndex;
				const isComplete = index < currentIndex;
				const StepIcon = step.icon;
				return (
					<div key={step.key} className="flex items-center gap-2">
						{index > 0 && (
							<CaretRightIcon size={14} className="shrink-0 text-subtle" />
						)}
						<button
							type="button"
							disabled={!isComplete}
							onClick={() => onStepSelect?.(step.key)}
							className={cn(
								"flex items-center gap-1.5 text-[13px] transition-colors",
								isComplete && "cursor-pointer hover:text-muted-foreground",
								isCurrent
									? "text-foreground font-medium"
									: "text-tertiary-foreground",
							)}
						>
							<StepIcon
								size={15}
								weight={isCurrent ? "fill" : "regular"}
								className={cn(!isCurrent && "text-subtle")}
							/>
							{step.label}
						</button>
					</div>
				);
			})}
		</div>
	);
}

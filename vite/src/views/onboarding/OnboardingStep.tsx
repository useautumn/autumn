import { CheckCircleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { OnboardingStepDefinition } from "./onboardingSteps";

/**
 * One spring drives height and opacity together, so the panel reads as a single
 * object arriving rather than a box that opens and content that fades in after.
 * `bounce: 0` keeps it crisp — springs also retarget from their current
 * velocity, so clicking between steps quickly stays continuous instead of
 * restarting.
 */
const PANEL_TRANSITION = {
	type: "spring" as const,
	bounce: 0,
	duration: 0.4,
};

/** Opacity finishes early: content is legible for most of the travel, and on
 * the way out it clears before the box has finished closing. */
const FADE_TRANSITION = {
	type: "spring" as const,
	bounce: 0,
	duration: 0.25,
};

function StepMarker({
	index,
	isComplete,
}: {
	index: number;
	isComplete: boolean;
}) {
	if (isComplete) {
		return (
			<CheckCircleIcon size={16} weight="fill" className="text-green-500" />
		);
	}

	return (
		<span className="flex size-4 items-center justify-center rounded-full border text-tiny text-tertiary-foreground">
			{index + 1}
		</span>
	);
}

function WaitingIndicator({ label }: { label: string }) {
	return (
		<span className="flex shrink-0 items-center gap-2 text-tiny text-subtle">
			{label}
			<span className="relative flex size-2">
				<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-500/60 opacity-75" />
				<span className="relative inline-flex size-2 rounded-full bg-yellow-500" />
			</span>
		</span>
	);
}

/** One row of the steps table: a table-height header row that expands in place. */
export function OnboardingStep({
	step,
	index,
	isComplete,
	isExpanded,
	onToggle,
	action,
	panel,
	wide = false,
}: {
	step: OnboardingStepDefinition;
	index: number;
	isComplete: boolean;
	isExpanded: boolean;
	onToggle: () => void;
	/** Left column: what the user does here. */
	action?: ReactNode;
	/** Right column: what has actually landed so far. */
	panel?: ReactNode;
	/** Single full-width column, for steps whose action is the whole body. */
	wide?: boolean;
}) {
	// Reduced motion keeps the fade — it explains what changed — but drops the
	// height travel, which is the part that moves the page.
	const reduceMotion = useReducedMotion();
	const panelTransition = reduceMotion
		? { ...FADE_TRANSITION, height: { duration: 0 } }
		: { ...PANEL_TRANSITION, opacity: FADE_TRANSITION };

	return (
		<div className={cn(isExpanded && "bg-muted dark:bg-card")}>
			<button
				type="button"
				onClick={onToggle}
				className={cn(
					"flex h-12 w-full items-center gap-2.5 px-4 text-left",
					!isExpanded && "hover:bg-muted/50 dark:hover:bg-card/50",
				)}
			>
				<StepMarker index={index} isComplete={isComplete} />
				<span
					className={cn(
						"truncate text-sm font-medium",
						isComplete && !isExpanded
							? "text-tertiary-foreground"
							: "text-foreground",
					)}
				>
					{step.title}
				</span>
				{isExpanded && !isComplete && step.waitingFor && (
					<span className="ml-auto">
						<WaitingIndicator label={step.waitingFor} />
					</span>
				)}
			</button>

			<AnimatePresence initial={false}>
				{isExpanded && (
					<motion.div
						key="body"
						initial={{ height: 0, opacity: 0 }}
						animate={{
							height: "auto",
							opacity: 1,
							transition: panelTransition,
						}}
						exit={{ height: 0, opacity: 0, transition: panelTransition }}
						// clip, not hidden: hidden makes a scroll container, which steals
						// focus rings mid-animation.
						className="[overflow:clip]"
					>
						{/* Body sits flush with the title, so both gutters read the same. */}
						<div className="px-4 pb-4">
							<p className="mb-3 text-xs text-muted-foreground">
								{step.description}
							</p>
							<div
								className={cn(
									"grid grid-cols-1 gap-4",
									!wide && panel && action && "lg:grid-cols-2",
								)}
							>
								{action && <div className="min-w-0">{action}</div>}
								{panel && <div className="min-w-0">{panel}</div>}
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

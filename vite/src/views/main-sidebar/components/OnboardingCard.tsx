"use client";

import { AppEnv } from "@autumn/shared";
import { ArrowRightIcon, ListChecksIcon } from "@phosphor-icons/react";
import { X } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { pushPage } from "@/utils/genUtils";
import { useOnboardingProgress } from "@/views/onboarding/hooks/useOnboardingProgress";
import { ONBOARDING_STEPS } from "@/views/onboarding/onboardingSteps";
import { useSidebarContext } from "../SidebarContext";

export function OnboardingCard() {
	const env = useEnv();
	const { expanded } = useSidebarContext();
	const {
		completed,
		completedCount,
		totalCount,
		currentStep,
		allComplete,
		isDismissed,
		dismiss,
	} = useOnboardingProgress();

	// Render nothing until progress is known: "0 of 5" on a set-up org is worse
	// than a beat of empty sidebar. A finished org gets its sidebar back too.
	if (!completed || env !== AppEnv.Sandbox || allComplete || isDismissed) {
		return null;
	}

	const nextStep = ONBOARDING_STEPS.find((step) => step.id === currentStep);
	const onboardingPath = pushPage({
		path: "/onboarding",
		preserveParams: false,
	});

	// One element in both states rather than a card swapped for a nav row: the
	// icon stays put and the rest fades, so collapsing doesn't jump.
	return (
		<div
			className={cn(
				"mb-2 rounded-lg",
				expanded
					? "border bg-interactive-secondary p-2"
					: "border border-transparent p-0",
			)}
		>
			{/* Relative so the trailing controls can be pinned rather than laid out:
			    in flow they'd slide as the label collapses to zero width. */}
			<Link
				to={onboardingPath}
				className="relative flex h-7 items-center gap-2 rounded-md px-2 text-muted-foreground hover:text-foreground"
			>
				<ListChecksIcon size={16} weight="duotone" className="shrink-0" />
				{/* No transition, matching NavButton: fading text while the rail
				    narrows leaves it legible over a shrinking box. It just goes. */}
				<span
					className={cn(
						"whitespace-nowrap text-xs font-medium text-foreground",
						expanded
							? "translate-x-0 opacity-100"
							: "pointer-events-none w-0 -translate-x-2 opacity-0",
					)}
				>
					Setup
				</span>
				<span
					className={cn(
						"absolute right-2 flex items-center gap-2",
						expanded ? "opacity-100" : "pointer-events-none opacity-0",
					)}
				>
					<span className="text-tiny text-tertiary-foreground tabular-nums">
						{completedCount} of {totalCount}
					</span>
					<button
						type="button"
						onClick={(e) => {
							e.preventDefault();
							dismiss();
						}}
						aria-label="Dismiss onboarding"
						className="text-tertiary-foreground transition-colors hover:text-foreground"
					>
						<X className="size-3" />
					</button>
				</span>
			</Link>

			{/* Clipped rather than transitioned: anything that animates here reads as
			    lagging behind the rail, which moves on its own 150ms. */}
			<div
				className={cn(
					"overflow-hidden px-2",
					expanded ? "max-h-40 pb-1 opacity-100" : "max-h-0 pb-0 opacity-0",
				)}
			>
				{/* Per step rather than a count, since steps can finish out of order. */}
				<div className="mt-1 flex gap-1">
					{ONBOARDING_STEPS.map((step) => (
						<span
							key={step.id}
							className={cn(
								"h-1 flex-1 rounded-full",
								completed[step.id] ? "bg-primary" : "bg-foreground/10",
							)}
						/>
					))}
				</div>

				{nextStep && (
					<div className="mt-3">
						<p className="truncate text-xs font-medium text-foreground">
							{nextStep.shortTitle}
						</p>
						<p className="mt-0.5 line-clamp-2 text-tiny text-tertiary-foreground">
							{nextStep.description}
						</p>
					</div>
				)}

				<Link
					to={onboardingPath}
					className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-btn-hover"
				>
					Continue
					<ArrowRightIcon size={12} weight="bold" />
				</Link>
			</div>
		</div>
	);
}

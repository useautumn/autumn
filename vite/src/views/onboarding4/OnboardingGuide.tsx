"use client";

import { AppEnv } from "@autumn/shared";
import {
	ChartBar,
	CheckCircle,
	CheckCircleIcon,
	CreditCard,
	CubeIcon,
	UserCircle,
} from "@phosphor-icons/react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { IconButton } from "@/components/v2/buttons/IconButton";
import type { StepId } from "@/lib/snippets";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import CreateProductSheet from "@/views/products/products/components/CreateProductSheet";
import { CodeSheet } from "./CodeSheet";
import {
	type OnboardingStepId,
	useOnboardingProgress,
} from "./hooks/useOnboardingProgress";
import { useOnboardingPrompt } from "./onboardingPrompts";

interface OnboardingStep {
	id: string;
	stepId?: StepId;
	title: string;
	shortTitle: string;
	icon: ReactNode;
	description: string;
	link?: string;
	linkText?: string;
	waitingFor?: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
	{
		id: "plans",
		title: "Create your plans",
		shortTitle: "Plans",
		icon: <CubeIcon size={20} weight="duotone" />,
		description:
			"Define your pricing plans and features your customers can access",
		link: "/quickstart",
		linkText: "Go to Quickstart",
	},
	{
		id: "customer",
		stepId: "customer",
		title: "Create a customer",
		shortTitle: "Customer",
		icon: <UserCircle size={20} weight="duotone" />,
		description:
			"Create your first customer: a user or organization that can be billed",
		waitingFor: "Waiting for customer",
	},
	{
		id: "payments",
		stepId: "payments",
		title: "Handle payments",
		shortTitle: "Payments",
		icon: <CreditCard size={20} weight="duotone" />,
		description: "Build your billing page and handle payments",
		waitingFor: "Waiting for checkout",
	},
	{
		id: "usage",
		stepId: "usage",
		title: "Limits and gating",
		shortTitle: "Gating",
		icon: <ChartBar size={20} weight="duotone" />,
		description: "Record usage events and enforce feature limits",
		waitingFor: "Waiting for event",
	},
];

function StepCard({
	step,
	isActive,
	isComplete,
	onClick,
}: {
	step: OnboardingStep;
	isActive: boolean;
	isComplete: boolean;
	onClick: () => void;
}) {
	const { getPrompt } = useOnboardingPrompt();
	const isPlansStep = step.id === "plans";
	const [createProductOpen, setCreateProductOpen] = useState(false);

	return (
		<motion.div
			initial={false}
			animate={{ flex: isActive ? 4 : 1 }}
			transition={{ duration: 0.3, ease: "easeInOut" }}
			className={cn(
				"relative rounded-xl border bg-card cursor-pointer h-29 overflow-hidden",
				isActive
					? "border-primary/30"
					: "hover:border-primary/20 hover:bg-interactive-secondary-hover",
				isComplete && !isActive && "opacity-50",
			)}
			onClick={onClick}
		>
			<AnimatePresence mode="popLayout" initial={false}>
				{/* Collapsed state - centered icon and title */}
				{!isActive && (
					<motion.div
						key="collapsed"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1, transition: { duration: 0.5 } }}
						exit={{ opacity: 0, transition: { duration: 0.1 } }}
						className="p-4 h-full flex flex-col items-center justify-center gap-2 relative"
					>
						{isComplete && (
							<CheckCircleIcon
								size={16}
								weight="fill"
								className="absolute top-2 right-2 text-green-500"
							/>
						)}
						<div className="text-primary/70">{step.icon}</div>
						<span className="font-medium text-sm text-t2 whitespace-nowrap">
							{step.shortTitle}
						</span>
					</motion.div>
				)}

				{/* Expanded content */}
				{isActive && (
					<motion.div
						key="expanded"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1, transition: { duration: 0.5 } }}
						exit={{ opacity: 0, transition: { duration: 0.1 } }}
						className="absolute top-0 left-0 bottom-0 w-[500px] p-4 pr-6 flex flex-col"
					>
						<div className="flex items-center gap-2">
							<h3 className="font-medium text-sm text-foreground mb-1">
								{step.title}
							</h3>
						</div>
						<p className="text-sm text-t3">{step.description}</p>

						<div className="pt-4 flex items-center gap-2 w-full">
							{/* Only show waiting indicator if step is not complete */}
							{isComplete && (
								<div className="flex items-center gap-2 text-xs text-green-600 mr-auto">
									<CheckCircle size={14} weight="fill" />
									Complete
								</div>
							)}
							{step.waitingFor && !isComplete && (
								<div className="flex items-center gap-2 text-tiny text-t3 mr-auto">
									<span className="relative flex size-2">
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 opacity-75" />
										<span className="relative inline-flex size-2 rounded-full bg-primary/60" />
									</span>
									{step.waitingFor}
								</div>
							)}

							{step.stepId && (
								<CodeSheet
									stepId={step.stepId}
									title={step.title}
									description={step.description}
								/>
							)}
							{isPlansStep ? (
								<>
									<CreateProductSheet
										open={createProductOpen}
										onOpenChange={setCreateProductOpen}
									/>
									<IconButton
										variant="secondary"
										className="ml-auto gap-2"
										size="sm"
										icon={<CubeIcon size={14} />}
										onClick={(e) => {
											e.stopPropagation();
											setCreateProductOpen(true);
										}}
									>
										Create Plan
									</IconButton>
								</>
							) : (
								<CopyButton
									text={getPrompt({ stepId: step.id }) || ""}
									variant="secondary"
									size="sm"
									iconOrientation="left"
								>
									Copy prompt
								</CopyButton>
							)}
							{/* Show completed indicator when step is complete */}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}

export function OnboardingGuide() {
	const env = useEnv();
	const { steps, currentStep, isLoading, isDismissed, dismiss } =
		useOnboardingProgress();
	const [activeStep, setActiveStep] = useState<string | null>(null);
	const prevCurrentStepRef = useRef<OnboardingStepId | null>(null);

	// Sync activeStep with currentStep when it changes (initial load or progress made)
	useEffect(() => {
		if (currentStep !== prevCurrentStepRef.current) {
			setActiveStep(currentStep);
			prevCurrentStepRef.current = currentStep;
		}
	}, [currentStep]);

	// Don't render cards until activeStep is synced
	const resolvedActiveStep = activeStep ?? currentStep;

	// Check if all steps are complete
	const allStepsComplete = ONBOARDING_STEPS.every(
		(step) => steps[step.id as OnboardingStepId]?.complete,
	);

	// Only show in sandbox
	if (env !== AppEnv.Sandbox) {
		return null;
	}

	if (isDismissed) {
		return null;
	}

	if (isLoading) {
		return (
			<div className="relative rounded-xl border bg-interactive-secondary p-4 shadow-sm">
				{/* Header skeleton */}
				<div className="mb-4 pr-8">
					<Skeleton className="h-4 w-32 mb-1.5 bg-card/50" />
					<Skeleton className="h-3 w-64 bg-card/50" />
				</div>
				{/* Steps skeleton - 4 cards */}
				<div className="flex gap-3 items-start">
					{[4, 1, 1, 1].map((flex, i) => (
						<Skeleton
							key={i}
							className={cn("rounded-lg h-30 bg-card/50", `flex-${flex}`)}
						/>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="relative rounded-xl border bg-interactive-secondary p-4 shadow-sm">
			{/* Dismiss button */}
			<button
				type="button"
				onClick={dismiss}
				className="absolute top-3 right-3 p-1 rounded-md text-t3 hover:text-foreground hover:bg-interactive-secondary-hover transition-colors"
				aria-label="Dismiss onboarding guide"
			>
				<X className="size-4" />
			</button>

			{/* Header */}
			<div className="mb-4 pr-8">
				<h2 className="text-sm font-semibold text-foreground">
					{allStepsComplete
						? "All steps complete 🎉"
						: "Get started with Autumn"}
				</h2>
				<p className="text-sm text-t3 mt-0.5">
					{allStepsComplete ? (
						<>
							Read the{" "}
							<a
								href="https://docs.useautumn.com/documentation/getting-started/display-billing"
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary hover:underline"
							>
								docs
							</a>{" "}
							to learn more about what you can do with Autumn
						</>
					) : (
						"4 steps to get your app's billing done in less than 30 minutes"
					)}
				</p>
			</div>

			{/* Steps container */}
			<div className="flex gap-3 items-start">
				{ONBOARDING_STEPS.map((step) => (
					<StepCard
						key={step.id}
						step={step}
						isActive={resolvedActiveStep === step.id}
						isComplete={steps[step.id as OnboardingStepId]?.complete ?? false}
						onClick={() => setActiveStep(step.id)}
					/>
				))}
			</div>
		</div>
	);
}

"use client";

import { AppEnv } from "@autumn/shared";
import {
	ChartBar,
	CheckCircleIcon,
	ClockIcon,
	CreditCard,
	CubeIcon,
	SparkleIcon,
	UserCircle,
} from "@phosphor-icons/react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import type { StepId } from "@/lib/snippets";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { pushPage } from "@/utils/genUtils";
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

// Animation timing that matches inline sheet animations
const STEP_CARD_ANIMATION = {
	duration: 0.45,
	ease: [0.32, 0.72, 0, 1] as const,
};

const ONBOARDING_STEPS: OnboardingStep[] = [
	{
		id: "plans",
		title: "Create your pricing plans",
		shortTitle: "Plans",
		icon: <CubeIcon size={16} weight="duotone" />,
		description:
			"Create a plan, set pricing, and add the features customers get with it",
		link: "/quickstart",
		linkText: "Go to Quickstart",
		waitingFor: "Waiting for plan",
	},
	{
		id: "customer",
		stepId: "customer",
		title: "Create a customer",
		shortTitle: "Customer",
		icon: <UserCircle size={16} weight="duotone" />,
		description:
			"Start integrating your pricing by creating a customer from your app",
		waitingFor: "Waiting for customer",
	},
	{
		id: "payments",
		stepId: "payments",
		title: "Handle payments",
		shortTitle: "Payments",
		icon: <CreditCard size={16} weight="duotone" />,
		description: "Build your billing page and handle payments",
		waitingFor: "Waiting for checkout",
	},
	{
		id: "usage",
		stepId: "usage",
		title: "Limits and gating",
		shortTitle: "Gating",
		icon: <ChartBar size={16} weight="duotone" />,
		description:
			"Give customers access to the features on their plan, and track usage",
		waitingFor: "Waiting for event",
	},
];

const STEP_BUTTON_CLASSES =
	"bg-t8/90 border-none hover:bg-t8 text-white! text-tiny";

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
	const navigate = useNavigate();
	const isPlansStep = step.id === "plans";
	const [createProductOpen, setCreateProductOpen] = useState(false);

	return (
		<motion.div
			initial={false}
			animate={{ flex: isActive ? 4 : 1 }}
			transition={STEP_CARD_ANIMATION}
			className={cn(
				"relative rounded-xl bg-t8/30 cursor-pointer h-21 overflow-hidden border border-t8/50",
				isActive ? "cursor-default" : "hover:border-primary/20 hover:bg-t8/40",
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
						<div className="flex items-center gap-1.5">
							<div className="text-t8">{step.icon}</div>
							<span className="font-medium text-sm text-t8 whitespace-nowrap">
								{step.shortTitle}
							</span>
						</div>
					</motion.div>
				)}

				{/* Expanded content */}
				{isActive && (
					<motion.div
						key="expanded"
						initial={{ opacity: 0.5 }}
						animate={{ opacity: 1, transition: { duration: 0.5 } }}
						exit={{ opacity: 0, transition: { duration: 0.1 } }}
						className="absolute top-0 left-0 bottom-0 w-[500px] px-4 flex gap-6"
					>
						<div className="flex flex-col justify-center">
							<h3 className="font-medium text-sm text-foreground mb-1">
								{step.title}
							</h3>
							<p className="text-xs text-t2">{step.description}</p>
						</div>

						<div className="flex flex-col gap-3 items-end justify-center">
							{isComplete && (
								<div className="flex items-center gap-2 text-xs text-green-600">
									<CheckCircleIcon size={14} weight="fill" />
									Complete
								</div>
							)}
							{step.waitingFor && !isComplete && (
								<div className="flex items-center gap-2 text-tiny text-t8">
									{step.waitingFor}
									<span className="relative flex size-2">
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-500/60 opacity-75" />
										<span className="relative inline-flex size-2 rounded-full bg-yellow-500" />
									</span>
								</div>
							)}
							<div className="flex items-center gap-2 w-full">
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
											className={cn("ml-auto gap-2", STEP_BUTTON_CLASSES)}
											size="sm"
											icon={<SparkleIcon size={14} />}
											onClick={(e) => {
												e.stopPropagation();
												pushPage({
													path: "/quickstart",
													navigate,
													preserveParams: false,
												});
											}}
										>
											AI chat
										</IconButton>
										<IconButton
											variant="secondary"
											className={cn("gap-2", STEP_BUTTON_CLASSES)}
											size="sm"
											icon={<CubeIcon size={14} />}
											onClick={(e) => {
												e.stopPropagation();
												setCreateProductOpen(true);
											}}
										>
											Create plan
										</IconButton>
									</>
								) : (
									<CopyButton
										text={getPrompt({ stepId: step.id }) || ""}
										variant="secondary"
										size="sm"
										iconOrientation="left"
										className={STEP_BUTTON_CLASSES}
									>
										Copy prompt
									</CopyButton>
								)}
								{/* Show completed indicator when step is complete */}
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}

export function OnboardingGuide({
	collapseAll = false,
}: {
	collapseAll?: boolean;
} = {}) {
	const env = useEnv();
	const { steps, currentStep, isLoading, isDismissed, dismiss } =
		useOnboardingProgress();
	const [activeStep, setActiveStep] = useState<string | null>(null);

	// Don't render cards until activeStep is synced
	// When collapseAll is true, all cards should be collapsed (no active step)
	const resolvedActiveStep = collapseAll ? null : (activeStep ?? currentStep);

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
			// SKELETON
			<div className="relative rounded-xl p-4 border border-dashed border-t8/50 bg-interactive-secondary">
				{/* Header skeleton */}
				<div className="mb-2 pr-8">
					<div className="flex items-center gap-2 mb-1">
						<Skeleton className="h-3.5 w-36 bg-t8/30" />
						<Skeleton className="h-4 w-16 rounded-md bg-t8/30" />
					</div>
					<Skeleton className="h-3 w-72 bg-t8/30" />
				</div>
				{/* Steps skeleton - 4 cards */}
				<div className="flex gap-3 items-start">
					{["flex-[4]", "flex-1", "flex-1", "flex-1"].map((flexClass, i) => (
						<Skeleton
							key={i}
							className={cn("rounded-xl h-21 bg-t8/40", flexClass)}
						/>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="relative rounded-xl p-4 border border-dashed border-t8/50 bg-interactive-secondary shadow-sm">
			{/* Dismiss button */}
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={dismiss}
						className="absolute top-3 right-3 p-1 rounded-md text-t8 hover:text-foreground hover:bg-interactive-secondary-hover transition-colors"
						aria-label="Dismiss onboarding guide"
					>
						<X className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="left" className="max-w-56">
					You can open the guide again by clicking on the "Need help" item in
					the sidebar.
				</TooltipContent>
			</Tooltip>

			{/* Header */}
			<div className="mb-2 pr-8">
				<div className="flex items-center gap-2">
					<h2 className="text-xs text-foreground">
						{allStepsComplete
							? "All steps complete 🎉"
							: "Get started with Autumn"}
					</h2>
					{!allStepsComplete && (
						<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-t3 text-[10px]">
							<ClockIcon size={10} />
							~30 mins
						</span>
					)}
				</div>
				<p className="text-xs text-t3 mt-0.5">
					{allStepsComplete ?? (
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

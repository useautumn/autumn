"use client";

import { AppEnv } from "@autumn/shared";
import {
	ChartBar,
	CheckCircle,
	CopySimple,
	CreditCard,
	CubeIcon,
	UserCircle,
} from "@phosphor-icons/react";
import { ArrowRight, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/v2/buttons/Button";
import type { StepId } from "@/lib/snippets";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { pushPage } from "@/utils/genUtils";
import { CodeSheet } from "./CodeSheet";
import {
	type OnboardingStepId,
	useOnboardingProgress,
} from "./hooks/useOnboardingProgress";

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
			"Define pricing tiers and features for your product. Set up base plans and add-ons to offer flexible pricing options.",
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
			"Add your first customer to start testing your billing integration.",
		waitingFor: "Waiting for customer",
	},
	{
		id: "payments",
		stepId: "payments",
		title: "Handle payments",
		shortTitle: "Payments",
		icon: <CreditCard size={20} weight="duotone" />,
		description:
			"Connect Stripe and configure billing to start accepting payments.",
		waitingFor: "Waiting for checkout",
	},
	{
		id: "usage",
		stepId: "usage",
		title: "Track usage",
		shortTitle: "Usage",
		icon: <ChartBar size={20} weight="duotone" />,
		description:
			"Monitor feature usage and customer activity to enforce limits and drive upgrades.",
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
	const navigate = useNavigate();
	const isPlansStep = step.id === "plans";

	return (
		<div
			style={{ flex: isActive ? 4 : 1 }}
			className={cn(
				"relative rounded-lg border bg-card cursor-pointer",
				"transition-[flex,border-color,background-color] duration-300 ease-out",
				isActive
					? "border-primary/30 bg-card min-h-[140px]"
					: "hover:border-primary/20 hover:bg-interactive-secondary-hover h-[140px]",
				isComplete && !isActive && "opacity-70",
			)}
			onClick={onClick}
		>
			{/* Collapsed state - centered icon and title */}
			{!isActive && (
				<div className="p-4 h-full flex flex-col items-center justify-center gap-2 relative">
					{isComplete && (
						<CheckCircle
							size={16}
							weight="fill"
							className="absolute top-2 right-2 text-green-500"
						/>
					)}
					<div className="text-t2">{step.icon}</div>
					<span className="font-medium text-sm text-t2 whitespace-nowrap">
						{step.shortTitle}
					</span>
				</div>
			)}

			{/* Expanded content */}
			{isActive && (
				<div className="p-4 flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<h3 className="font-medium text-sm text-foreground">
							{step.title}
						</h3>
						{isComplete && (
							<CheckCircle size={16} weight="fill" className="text-green-500" />
						)}
					</div>
					<p className="text-sm text-t2">{step.description}</p>

					<div className="mt-auto pt-2 flex items-center gap-3">
						{isPlansStep && step.link ? (
							<Button
								variant="secondary"
								size="sm"
								onClick={(e) => {
									e.stopPropagation();
									if (step.link) {
										navigate(
											pushPage({ path: step.link, preserveParams: false }),
										);
									}
								}}
							>
								{step.linkText}
								<ArrowRight className="size-3.5" />
							</Button>
						) : (
							<>
								<Button
									variant="secondary"
									size="sm"
									onClick={(e) => {
										e.stopPropagation();
									}}
								>
									<CopySimple className="size-3.5" />
									Copy prompt
								</Button>
								{step.stepId && (
									<CodeSheet
										stepId={step.stepId}
										title={step.title}
										description={step.description}
									/>
								)}
								{/* Only show waiting indicator if step is not complete */}
								{step.waitingFor && !isComplete && (
									<div className="flex items-center gap-2 text-xs text-t3">
										<span className="relative flex size-2">
											<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 opacity-75" />
											<span className="relative inline-flex size-2 rounded-full bg-primary/60" />
										</span>
										{step.waitingFor}
									</div>
								)}
								{/* Show completed indicator when step is complete */}
								{isComplete && (
									<div className="flex items-center gap-2 text-xs text-green-600">
										<CheckCircle size={14} weight="fill" />
										Complete
									</div>
								)}
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export function OnboardingGuide() {
	const env = useEnv();
	const { steps, currentStep, isLoading, isDismissed, dismiss } =
		useOnboardingProgress();
	const [activeStep, setActiveStep] = useState<string>("plans");
	const prevCurrentStepRef = useRef<OnboardingStepId | null>(null);

	// Sync activeStep with currentStep when it changes (initial load or progress made)
	useEffect(() => {
		if (currentStep !== prevCurrentStepRef.current) {
			setActiveStep(currentStep);
			prevCurrentStepRef.current = currentStep;
		}
	}, [currentStep]);

	// Only show in sandbox
	if (env !== AppEnv.Sandbox) {
		return null;
	}

	if (isDismissed) {
		return null;
	}

	if (isLoading) {
		return (
			<div className="relative rounded-xl border bg-card p-4 shadow-sm">
				{/* Header skeleton */}
				<div className="mb-4 pr-8">
					<Skeleton className="h-4 w-32 mb-1.5" />
					<Skeleton className="h-3 w-64" />
				</div>
				{/* Steps skeleton - 4 cards */}
				<div className="flex gap-3 items-start">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton
							key={i}
							className={cn(
								"rounded-lg h-[140px]",
								i === 0 ? "flex-4" : "flex-1",
							)}
						/>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="relative rounded-xl border bg-card p-4 shadow-sm">
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
					Getting Started
				</h2>
				<p className="text-xs text-t3 mt-0.5">
					Complete these steps to set up billing for your product
				</p>
			</div>

			{/* Steps container */}
			<div className="flex gap-3 items-start">
				{ONBOARDING_STEPS.map((step) => (
					<StepCard
						key={step.id}
						step={step}
						isActive={activeStep === step.id}
						isComplete={steps[step.id as OnboardingStepId]?.complete ?? false}
						onClick={() => setActiveStep(step.id)}
					/>
				))}
			</div>
		</div>
	);
}

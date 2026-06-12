"use client";

import { AppEnv } from "@autumn/shared";
import {
	CheckCircleIcon,
	CircleIcon,
	CodeIcon,
	CubeIcon,
	SparkleIcon,
} from "@phosphor-icons/react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useClickOutside } from "@/hooks/common/useClickOutside";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { IconButton } from "@/components/v2/buttons/IconButton";
import type { StepId } from "@/lib/snippets";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { pushPage } from "@/utils/genUtils";
import { CodeSheet } from "@/views/onboarding4/CodeSheet";
import {
	type OnboardingStepId,
	useOnboardingProgress,
} from "@/views/onboarding4/hooks/useOnboardingProgress";
import { useOnboardingPrompt } from "@/views/onboarding4/onboardingPrompts";
import CreateProductSheet from "@/views/products/products/components/CreateProductSheet";
import { useSidebarContext } from "./SidebarContext";

interface OnboardingStep {
	id: OnboardingStepId;
	codeStepId?: StepId;
	label: string;
	title: string;
	description: string;
	waitingFor?: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
	{
		id: "plans",
		label: "Create a pricing plan",
		title: "Create your pricing plans",
		description:
			"Create a plan, set pricing, and add the features customers get with this plan",
		waitingFor: "Waiting for plan",
	},
	{
		id: "customer",
		codeStepId: "customer",
		label: "Create your first customer",
		title: "Set up Autumn",
		description:
			"Add Autumn to your codebase: install the SDK, create a customer, and add the payment flow",
		waitingFor: "Waiting for customer",
	},
	{
		id: "usage",
		codeStepId: "usage",
		label: "Track usage",
		title: "Checking and tracking balances",
		description:
			"Give customers access to the features on their plan, and track usage",
		waitingFor: "Waiting for event",
	},
];

const PANEL_ANIMATION = {
	duration: 0.25,
	ease: [0.32, 0.72, 0, 1] as const,
};

function StepActions({
	step,
	onCreatePlan,
	onShowDocs,
}: {
	step: OnboardingStep;
	onCreatePlan: () => void;
	onShowDocs: () => void;
}) {
	const navigate = useNavigate();
	const { getPrompt } = useOnboardingPrompt();

	if (step.id === "plans") {
		return (
			<>
				<IconButton
					variant="secondary"
					size="sm"
					className="gap-2"
					icon={<SparkleIcon size={14} />}
					onClick={() => {
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
					size="sm"
					className="gap-2"
					icon={<CubeIcon size={14} />}
					onClick={onCreatePlan}
				>
					Create plan
				</IconButton>
			</>
		);
	}

	return (
		<>
			<IconButton
				variant="secondary"
				size="sm"
				className="gap-2"
				icon={<CodeIcon size={14} />}
				onClick={onShowDocs}
			>
				Show docs
			</IconButton>
			<CopyButton
				text={getPrompt({ stepId: step.id }) || ""}
				variant="secondary"
				size="sm"
				iconOrientation="left"
				className="gap-2"
			>
				Copy prompt
			</CopyButton>
		</>
	);
}

function StepPanel({
	step,
	isComplete,
	onClose,
	onCreatePlan,
	onShowDocs,
}: {
	step: OnboardingStep;
	isComplete: boolean;
	onClose: () => void;
	onCreatePlan: () => void;
	onShowDocs: () => void;
}) {
	return (
		<motion.div
			key={step.id}
			initial={{ opacity: 0, x: -8 }}
			animate={{ opacity: 1, x: 0 }}
			exit={{ opacity: 0, x: -8 }}
			transition={PANEL_ANIMATION}
			className="absolute bottom-0 left-full ml-3 w-96 z-[160] rounded-lg bg-interactive-secondary ring-1 ring-foreground/10 shadow-md p-4"
		>
			<div className="flex flex-col gap-3">
				<div className="flex items-start justify-between gap-2">
					<div>
						<h3 className="font-medium text-sm text-foreground mb-1">
							{step.title}
						</h3>
						<p className="text-xs text-muted-foreground">{step.description}</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-interactive-secondary-hover transition-colors"
						aria-label="Close step details"
					>
						<X className="size-3.5" />
					</button>
				</div>
				{isComplete ? (
					<div className="flex items-center gap-2 text-xs text-green-600">
						<CheckCircleIcon size={14} weight="fill" />
						Complete
					</div>
				) : (
					step.waitingFor && (
						<div className="flex items-center gap-2 text-tiny text-subtle">
							{step.waitingFor}
							<span className="relative flex size-2">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-500/60 opacity-75" />
								<span className="relative inline-flex size-2 rounded-full bg-yellow-500" />
							</span>
						</div>
					)
				)}
				<div className="flex items-center gap-2">
					<StepActions
						step={step}
						onCreatePlan={onCreatePlan}
						onShowDocs={onShowDocs}
					/>
				</div>
			</div>
		</motion.div>
	);
}

export function SidebarOnboarding(): ReactNode {
	const env = useEnv();
	const { expanded } = useSidebarContext();
	const { steps, currentStep, isLoading, isDismissed, dismiss } =
		useOnboardingProgress();
	const [createProductOpen, setCreateProductOpen] = useState(false);
	const [codeSheetStep, setCodeSheetStep] = useState<OnboardingStep | null>(
		null,
	);
	const [codeSheetOpen, setCodeSheetOpen] = useState(false);
	const [panelOverride, setPanelOverride] = useState<{
		override: OnboardingStepId | "closed";
		forStep: OnboardingStepId;
	} | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const completedCount = ONBOARDING_STEPS.filter(
		(step) => steps[step.id]?.complete,
	).length;
	const percentComplete = Math.round(
		(completedCount / ONBOARDING_STEPS.length) * 100,
	);
	const allStepsComplete = completedCount === ONBOARDING_STEPS.length;

	const override =
		panelOverride?.forStep === currentStep ? panelOverride.override : null;
	const activeStepId =
		override === "closed"
			? null
			: (override ?? (allStepsComplete ? null : currentStep));
	const activeStep = ONBOARDING_STEPS.find((step) => step.id === activeStepId);

	const closePanel = () =>
		setPanelOverride({ override: "closed", forStep: currentStep });
	const toggleStep = (stepId: OnboardingStepId) =>
		setPanelOverride({
			override: activeStepId === stepId ? "closed" : stepId,
			forStep: currentStep,
		});

	useClickOutside({
		ref: containerRef,
		enabled: activeStepId != null,
		onClickOutside: closePanel,
	});

	if (env !== AppEnv.Sandbox || !expanded || isDismissed || isLoading) {
		return null;
	}

	return (
		<div ref={containerRef} className="relative mx-2 mb-3">
			<div className="rounded-lg border bg-muted dark:bg-card">
				<div className="flex items-center justify-between px-3 py-2 border-b">
					<h2 className="text-xs font-medium text-foreground">
						{allStepsComplete ? "Onboarding Complete!" : "Getting Started"}
					</h2>
					<button
						type="button"
						onClick={dismiss}
						className="rounded-md text-muted-foreground hover:text-foreground hover:bg-interactive-secondary-hover transition-colors"
						aria-label="Dismiss onboarding guide"
					>
						<X className="size-3.5" />
					</button>
				</div>

				<div className="flex flex-col gap-2 px-3 py-2.5">
		<div className="flex flex-col gap-1.5">
						<div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
							<div
								className="h-full rounded-full bg-primary transition-all duration-500"
								style={{ width: `${percentComplete}%` }}
							/>
						</div>
						<span className="text-tiny text-muted-foreground">
							{percentComplete}% Completed
						</span>
					</div>

		<div className="flex flex-col gap-0.5 -mx-1">
						{ONBOARDING_STEPS.map((step) => {
							const isComplete = steps[step.id]?.complete ?? false;
							return (
								<button
									key={step.id}
									type="button"
									onClick={() => toggleStep(step.id)}
									className={cn(
										"flex items-center gap-2 w-full rounded-md px-1 py-1 text-left transition-colors hover:bg-interactive-secondary-hover",
										activeStepId === step.id && "bg-interactive-secondary",
									)}
								>
									{isComplete ? (
										<CheckCircleIcon
											size={16}
											weight="fill"
											className="text-primary shrink-0"
										/>
									) : (
										<CircleIcon
											size={16}
											className="text-muted-foreground shrink-0"
										/>
									)}
									<span
										className={cn(
											"text-xs",
											isComplete
												? "text-muted-foreground line-through"
												: "text-foreground",
										)}
									>
										{step.label}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			</div>

			<AnimatePresence>
				{activeStep && (
					<StepPanel
						step={activeStep}
						isComplete={steps[activeStep.id]?.complete ?? false}
						onClose={closePanel}
						onCreatePlan={() => setCreateProductOpen(true)}
						onShowDocs={() => {
							setCodeSheetStep(activeStep);
							setCodeSheetOpen(true);
						}}
					/>
				)}
			</AnimatePresence>

			<CreateProductSheet
				open={createProductOpen}
				onOpenChange={setCreateProductOpen}
			/>
			{codeSheetStep?.codeStepId && (
				<CodeSheet
					stepId={codeSheetStep.codeStepId}
					title={codeSheetStep.title}
					description={codeSheetStep.description}
					open={codeSheetOpen}
					onOpenChange={setCodeSheetOpen}
					hideTrigger
				/>
			)}
		</div>
	);
}

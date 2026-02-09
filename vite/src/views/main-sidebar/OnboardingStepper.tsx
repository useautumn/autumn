import { AppEnv } from "@autumn/shared";
import {
	CaretLeft,
	CaretRight,
	ChartBar,
	CheckCircle,
	CreditCard,
	CubeIcon,
	SparkleIcon,
	UserCircle,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
	stepId?: StepId;
	title: string;
	shortTitle: string;
	icon: ReactNode;
	description: string;
	waitingFor: string;
}

const STEPS: OnboardingStep[] = [
	{
		id: "plans",
		title: "Create your pricing plans",
		shortTitle: "Plans",
		icon: <CubeIcon size={14} weight="duotone" />,
		description:
			"Create a plan, set pricing, and add the features customers get with it",
		waitingFor: "Waiting for plan",
	},
	{
		id: "customer",
		stepId: "customer",
		title: "Create a customer",
		shortTitle: "Customer",
		icon: <UserCircle size={14} weight="duotone" />,
		description:
			"Start integrating your pricing by creating a customer from your app",
		waitingFor: "Waiting for customer",
	},
	{
		id: "payments",
		stepId: "payments",
		title: "Handle payments",
		shortTitle: "Payments",
		icon: <CreditCard size={14} weight="duotone" />,
		description: "Build your billing page and handle payments",
		waitingFor: "Waiting for checkout",
	},
	{
		id: "usage",
		stepId: "usage",
		title: "Limits and gating",
		shortTitle: "Gating",
		icon: <ChartBar size={14} weight="duotone" />,
		description:
			"Give customers access to the features on their plan, and track usage",
		waitingFor: "Waiting for event",
	},
];

const STEP_BUTTON_CLASSES = "text-[10px] h-5 px-1.5";

function StepperContent({
	viewingStep,
	setViewingStep,
	steps,
}: {
	viewingStep: OnboardingStepId;
	setViewingStep: (step: OnboardingStepId) => void;
	steps: Record<OnboardingStepId, { complete: boolean }>;
}) {
	const navigate = useNavigate();
	const { getPrompt } = useOnboardingPrompt();
	const [createProductOpen, setCreateProductOpen] = useState(false);

	const currentIndex = STEPS.findIndex((s) => s.id === viewingStep);
	const step = STEPS[currentIndex];
	const isComplete = steps[step.id]?.complete ?? false;
	const isPlansStep = step.id === "plans";

	const goBack = () => {
		if (currentIndex > 0) {
			setViewingStep(STEPS[currentIndex - 1].id);
		}
	};

	const goForward = () => {
		if (currentIndex < STEPS.length - 1) {
			setViewingStep(STEPS[currentIndex + 1].id);
		}
	};

	return (
		<div className="flex flex-col gap-2">
			{/* Navigation row with step title */}
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={goBack}
					disabled={currentIndex === 0}
					className={cn(
						"p-0.5 rounded hover:bg-interactive-secondary-hover transition-colors shrink-0",
						currentIndex === 0 && "opacity-30 cursor-not-allowed",
					)}
				>
					<CaretLeft size={12} className="text-t2" />
				</button>

				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					<div className="text-t2 shrink-0">{step.icon}</div>
					<span className="text-xs font-medium text-t1 truncate">
						{step.title}
					</span>
				</div>

				<button
					type="button"
					onClick={goForward}
					disabled={currentIndex === STEPS.length - 1}
					className={cn(
						"p-0.5 rounded hover:bg-interactive-secondary-hover transition-colors shrink-0",
						currentIndex === STEPS.length - 1 &&
							"opacity-30 cursor-not-allowed",
					)}
				>
					<CaretRight size={12} className="text-t2" />
				</button>
			</div>

			{/* Description */}
			<p className="text-[10px] text-t3 leading-tight">{step.description}</p>

			{/* Status indicator */}
			<div className="flex items-center gap-1.5">
				{isComplete ? (
					<div className="flex items-center gap-1 text-[10px] text-green-600">
						<CheckCircle size={12} weight="fill" />
						Complete
					</div>
				) : (
					<div className="flex items-center gap-1 text-[10px] text-t3">
						<span className="relative flex size-1.5">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-500/60 opacity-75" />
							<span className="relative inline-flex size-1.5 rounded-full bg-yellow-500" />
						</span>
						{step.waitingFor}
					</div>
				)}
			</div>

			{/* Dot indicators */}
			<div className="flex justify-center gap-1.5 py-1">
				{STEPS.map((s, i) => (
					<button
						key={s.id}
						type="button"
						onClick={() => setViewingStep(s.id)}
						className={cn(
							"w-1.5 h-1.5 rounded-full transition-colors",
							steps[s.id]?.complete
								? "bg-green-500"
								: i === currentIndex
									? "bg-primary"
									: "bg-t3/50",
						)}
					/>
				))}
			</div>

			{/* Action buttons */}
			<div className="flex flex-wrap items-center gap-1">
				{isPlansStep ? (
					<>
						<CreateProductSheet
							open={createProductOpen}
							onOpenChange={setCreateProductOpen}
						/>
						<IconButton
							variant="secondary"
							className={STEP_BUTTON_CLASSES}
							size="sm"
							icon={<SparkleIcon size={10} />}
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
							className={STEP_BUTTON_CLASSES}
							size="sm"
							icon={<CubeIcon size={10} />}
							onClick={() => setCreateProductOpen(true)}
						>
							Create plan
						</IconButton>
					</>
				) : (
					<>
						{step.stepId && (
							<CodeSheet
								stepId={step.stepId}
								title={step.title}
								description={step.description}
								buttonClassName={STEP_BUTTON_CLASSES}
								buttonLabel="Docs"
							/>
						)}
						<CopyButton
							text={getPrompt({ stepId: step.id }) || ""}
							variant="secondary"
							size="sm"
							iconOrientation="left"
							className={STEP_BUTTON_CLASSES}
						>
							Copy prompt
						</CopyButton>
					</>
				)}
			</div>
		</div>
	);
}

export function OnboardingStepper() {
	const env = useEnv();
	const { expanded } = useSidebarContext();
	const { steps, currentStep, isLoading, isDismissed } =
		useOnboardingProgress();

	const [viewingStep, setViewingStep] = useState<OnboardingStepId>(currentStep);
	const [dropdownOpen, setDropdownOpen] = useState(false);

	// Auto-sync viewingStep when currentStep changes
	useEffect(() => {
		setViewingStep(currentStep);
	}, [currentStep]);

	// Only show in sandbox
	if (env !== AppEnv.Sandbox) return null;

	// Don't show if dismissed
	if (isDismissed) return null;

	// Don't show while loading
	if (isLoading) return null;

	// Collapsed sidebar: show icon with dropdown
	if (!expanded) {
		return (
			<div className="px-2">
				<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="w-full flex justify-center items-center h-7 rounded-lg hover:bg-interactive-secondary-hover transition-colors"
						>
							<CubeIcon size={16} weight="duotone" className="text-t2" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						side="right"
						align="start"
						className="p-2 w-[200px]"
					>
						<StepperContent
							viewingStep={viewingStep}
							setViewingStep={setViewingStep}
							steps={steps}
						/>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		);
	}

	// Expanded sidebar: show inline stepper
	return (
		<div className="px-2 py-2 border-t border-dashed border-border">
			<StepperContent
				viewingStep={viewingStep}
				setViewingStep={setViewingStep}
				steps={steps}
			/>
		</div>
	);
}

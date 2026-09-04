"use client";

import { AppEnv } from "@autumn/shared";
import { PageContainer, PageHeader, Progress } from "@autumn/ui";
import { ListChecksIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useEnv } from "@/utils/envUtils";
import {
	type OnboardingEvidence,
	useOnboardingEvidence,
} from "./hooks/useOnboardingEvidence";
import {
	type OnboardingStepId,
	useOnboardingProgress,
} from "./hooks/useOnboardingProgress";
import { useStableScrollbar } from "./hooks/useStableScrollbar";
import { OnboardingStep } from "./OnboardingStep";
import { ONBOARDING_STEPS } from "./onboardingSteps";
import { CatalogPanel } from "./panels/CatalogPanel";
import { CustomersPanel } from "./panels/CustomersPanel";
import { DeployPanel } from "./panels/DeployPanel";
import { EventsPanel } from "./panels/EventsPanel";
import { SetupPromptPanel } from "./panels/SetupPromptPanel";

type StepContent = { action?: ReactNode; panel?: ReactNode; wide?: boolean };

const stepContent = (
	evidence: OnboardingEvidence,
): Record<OnboardingStepId, StepContent> => ({
	prompt: { action: <SetupPromptPanel /> },
	catalog: {
		// The card rail needs the full row; a half-width column would scroll
		// horizontally with two cards visible.
		wide: true,
		panel: (
			<CatalogPanel
				products={evidence.products}
				features={evidence.features}
				isLoading={evidence.isCatalogLoading}
			/>
		),
	},
	customer: {
		panel: (
			<CustomersPanel
				customers={evidence.customers}
				isLoading={evidence.isCustomersLoading}
			/>
		),
	},
	usage: {
		panel: (
			<EventsPanel
				events={evidence.events}
				isLoading={evidence.isEventsLoading}
			/>
		),
	},
	deploy: { action: <DeployPanel />, wide: true },
});

function OnboardingView() {
	const env = useEnv();
	const { completed, currentStep, completedCount, totalCount, allComplete } =
		useOnboardingProgress();
	const evidence = useOnboardingEvidence();
	const [openStep, setOpenStep] = useState<OnboardingStepId | null>(null);
	useStableScrollbar();

	// Latched to the first known step: `currentStep` moves as progress lands, and
	// following it would reopen a different step under the user mid-read.
	const autoOpened = useRef<OnboardingStepId | null>(null);
	if (autoOpened.current === null && currentStep) {
		autoOpened.current = currentStep;
	}

	const expandedStep = openStep ?? autoOpened.current;
	const content = stepContent(evidence);

	// Deploying is a live-env action; every other step describes sandbox work.
	const steps = ONBOARDING_STEPS.filter(
		(step) => step.id !== "deploy" || env === AppEnv.Sandbox,
	);

	return (
		<PageContainer>
			<PageHeader
				icon={
					<ListChecksIcon size={16} weight="fill" className="text-subtle" />
				}
				title={allComplete ? "All set up" : "Get started"}
			>
				<span className="text-xs text-tertiary-foreground tabular-nums">
					{completedCount} of {totalCount}
				</span>
				<Progress
					value={(completedCount / totalCount) * 100}
					className="w-24 gap-0 [&_[data-slot=progress-indicator]]:transition-none"
				/>
			</PageHeader>
			<div className="w-full divide-y rounded-lg border">
				{steps.map((step, index) => (
					<OnboardingStep
						key={step.id}
						step={step}
						index={index}
						isComplete={completed?.[step.id] ?? false}
						isExpanded={expandedStep === step.id}
						onToggle={() =>
							setOpenStep(expandedStep === step.id ? null : step.id)
						}
						{...content[step.id]}
					/>
				))}
			</div>
		</PageContainer>
	);
}

export default OnboardingView;

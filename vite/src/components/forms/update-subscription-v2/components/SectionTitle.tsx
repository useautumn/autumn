import { TimerIcon } from "@phosphor-icons/react";
import { PlanSectionTitle } from "@/components/forms/shared/PlanSectionTitle";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";
import type { UseTrialStateReturn } from "../hooks/useTrialState";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";

interface SectionTitleProps {
	hasCustomizations: boolean;
	form: UseUpdateSubscriptionForm;
	numVersions?: number;
	currentVersion?: number;
	trialState: UseTrialStateReturn;
}

export function SectionTitle({
	hasCustomizations,
	form,
	numVersions,
	currentVersion,
	trialState,
}: SectionTitleProps) {
	const showTrialToggle = !trialState.isCurrentlyTrialing;
	const trialIsActive =
		(trialState.isCurrentlyTrialing || trialState.isTrialExpanded) &&
		!trialState.removeTrial;

	const trialAction = showTrialToggle ? (
		<Tooltip>
			<TooltipTrigger asChild>
				<IconButton
					icon={
						<TimerIcon size={14} weight={trialIsActive ? "fill" : "regular"} />
					}
					variant="secondary"
					className={cn(
						"h-7 whitespace-nowrap",
						trialIsActive &&
							"text-purple-400! border-purple-500/50 bg-purple-500/10",
						trialState.isTrialExpanded && !trialIsActive && "border-primary",
						trialState.removeTrial &&
							"text-red-400! border-red-500/50 bg-red-500/10",
					)}
					onClick={trialState.handleToggleTrial}
				>
					{trialIsActive && trialState.remainingTrialDays
						? `${trialState.remainingTrialDays}d`
						: "Free Trial"}
				</IconButton>
			</TooltipTrigger>
			<TooltipContent side="top">
				{trialIsActive
					? "Trial active - click to manage"
					: trialState.removeTrial
						? "Trial will be removed - click to undo"
						: "Add a free trial"}
			</TooltipContent>
		</Tooltip>
	) : undefined;

	return (
		<form.AppField name="version">
			{(field) => (
				<PlanSectionTitle
					hasCustomizations={hasCustomizations}
					numVersions={numVersions}
					selectedVersion={field.state.value ?? currentVersion}
					onVersionChange={(v) => field.handleChange(v)}
					trialAction={trialAction}
				/>
			)}
		</form.AppField>
	);
}

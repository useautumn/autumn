import { InfoIcon, TimerIcon } from "@phosphor-icons/react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
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
	isPaidProduct: boolean;
}

export function SectionTitle({
	hasCustomizations,
	form,
	numVersions,
	currentVersion,
	trialState,
	isPaidProduct,
}: SectionTitleProps) {
	const showVersionSelector = numVersions !== undefined && numVersions > 1;

	const versionOptions = showVersionSelector
		? Array.from(
				{ length: numVersions },
				(_, index) => numVersions - index,
			).map((version) => ({
				label: `Version ${version}`,
				value: String(version),
			}))
		: [];

	const showTrialToggle = isPaidProduct && !trialState.isCurrentlyTrialing;
	const trialIsActive =
		(trialState.isCurrentlyTrialing || trialState.hasTrialValue) &&
		!trialState.removeTrial;

	return (
		<span className="flex items-center justify-between w-full gap-2">
			<span className="flex items-center gap-1.5">
				Plan Configuration
				{hasCustomizations && (
					<Tooltip>
						<TooltipTrigger asChild>
							<InfoIcon
								size={14}
								weight="fill"
								className="text-amber-500 cursor-help"
							/>
						</TooltipTrigger>
						<TooltipContent side="top">
							This subscription's configuration was edited. See changes below.
						</TooltipContent>
					</Tooltip>
				)}
			</span>
			<span className="flex items-center gap-2">
				{showTrialToggle && (
					<Tooltip>
						<TooltipTrigger asChild>
							<IconButton
								icon={
									<TimerIcon
										size={14}
										weight={trialIsActive ? "fill" : "regular"}
									/>
								}
								variant="secondary"
								size="sm"
								className={cn(
									"h-7 whitespace-nowrap",
									trialIsActive &&
										"text-purple-400! border-purple-500/50 bg-purple-500/10",
									trialState.isTrialExpanded &&
										!trialIsActive &&
										"border-primary",
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
				)}
				{showVersionSelector && (
					<form.AppField name="version">
						{(field) => (
							<Select
								value={String(field.state.value ?? currentVersion)}
								onValueChange={(value) => field.handleChange(Number(value))}
							>
								<SelectTrigger className="w-fit h-7 text-xs whitespace-nowrap">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{versionOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</form.AppField>
				)}
			</span>
		</span>
	);
}

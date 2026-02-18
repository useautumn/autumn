import { TimerIcon } from "@phosphor-icons/react";
import { PlanSectionTitle } from "@/components/forms/shared/PlanSectionTitle";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";
import { useAttachFormContext } from "../context/AttachFormProvider";

export function AttachSectionTitle() {
	const { hasCustomizations, form, formValues, numVersions, product } =
		useAttachFormContext();
	const { trialEnabled, trialLength } = formValues;

	const hasTrialValue = trialLength !== null && trialLength > 0;
	const trialIsActive = trialEnabled && hasTrialValue;

	const trialAction = (
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
						trialEnabled && !trialIsActive && "border-primary",
					)}
					onClick={() => form.setFieldValue("trialEnabled", !trialEnabled)}
				>
					Free Trial
				</IconButton>
			</TooltipTrigger>
			<TooltipContent side="top">
				{trialIsActive
					? "Trial configured - click to edit"
					: "Add a free trial"}
			</TooltipContent>
		</Tooltip>
	);

	return (
		<form.AppField name="version">
			{(field) => (
				<PlanSectionTitle
					hasCustomizations={hasCustomizations}
					numVersions={numVersions}
					selectedVersion={field.state.value ?? product?.version}
					onVersionChange={(v) => field.handleChange(v)}
					trialAction={trialAction}
				/>
			)}
		</form.AppField>
	);
}

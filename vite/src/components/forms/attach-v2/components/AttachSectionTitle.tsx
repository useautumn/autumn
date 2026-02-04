import { InfoIcon, TimerIcon } from "@phosphor-icons/react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { AttachSettingsPopover } from "./AttachSettingsPopover";

export function AttachSectionTitle() {
	const { hasCustomizations, form, formValues } = useAttachFormContext();
	const { trialEnabled, trialLength } = formValues;

	const hasTrialValue = trialLength !== null && trialLength > 0;
	const trialIsActive = trialEnabled && hasTrialValue;

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
							This plan's configuration has been customized. See changes below.
						</TooltipContent>
					</Tooltip>
				)}
			</span>
			<span className="flex items-center gap-2">
				<AttachSettingsPopover />
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
			</span>
		</span>
	);
}

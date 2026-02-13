import type { PlanTiming } from "@autumn/shared";
import { CalendarIcon, GearIcon, LightningIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";
import { useAttachFormContext } from "../context/AttachFormProvider";

export function AttachSettingsPopover() {
	const [open, setOpen] = useState(false);
	const { form, formValues, previewQuery } = useAttachFormContext();
	const { planSchedule } = formValues;
	const previewData = previewQuery.data;

	const hasOutgoing = (previewData?.outgoing.length ?? 0) > 0;

	// Compute the default planSchedule based on upgrade vs downgrade
	const defaultPlanSchedule = useMemo((): PlanTiming => {
		if (!previewData || !hasOutgoing) return "immediate";

		// Compare prices to determine upgrade vs downgrade
		const incomingPrice = previewData.incoming[0]?.plan.price?.amount ?? 0;
		const outgoingPrice = previewData.outgoing[0]?.plan.price?.amount ?? 0;
		const isUpgrade = incomingPrice > outgoingPrice;

		return isUpgrade ? "immediate" : "end_of_cycle";
	}, [previewData, hasOutgoing]);

	// Force "immediate" when there's no current product to transition from
	const effectivePlanSchedule = !hasOutgoing
		? "immediate"
		: (planSchedule ?? defaultPlanSchedule);

	const handleScheduleChange = (value: PlanTiming) => {
		form.setFieldValue("planSchedule", value);
	};

	const isImmediateSelected = effectivePlanSchedule === "immediate";
	const isEndOfCycleSelected = effectivePlanSchedule === "end_of_cycle";

	// Show blue highlight when user has overridden the default
	const hasCustomSchedule =
		planSchedule !== null && planSchedule !== defaultPlanSchedule;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<IconButton
					icon={
						<GearIcon
							size={14}
							weight={hasCustomSchedule ? "fill" : "regular"}
						/>
					}
					variant="secondary"
					className={cn(
						"h-7 whitespace-nowrap",
						hasCustomSchedule &&
							"text-blue-400! border-blue-500/50 bg-blue-500/10",
					)}
				>
					Settings
				</IconButton>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="p-3 w-[380px] z-101 bg-muted"
				sideOffset={4}
				onOpenAutoFocus={(e) => e.preventDefault()}
				onCloseAutoFocus={(e) => e.preventDefault()}
			>
				<div className="space-y-3">
					<div className="flex flex-col gap-1">
						<p className="text-t2 font-medium text-base">
							Advanced Configuration
						</p>
						<p className="text-t3 text-xs">Override default billing behavior</p>
					</div>
					<Separator />
					<div className="flex items-center justify-between gap-3">
						<span className="text-t1 text-sm">Plan Schedule</span>
						<div className="flex">
							<IconCheckbox
								icon={<LightningIcon />}
								iconOrientation="left"
								variant="secondary"
								size="sm"
								checked={isImmediateSelected}
								onCheckedChange={() => handleScheduleChange("immediate")}
								className={cn(
									"rounded-r-none",
									!isImmediateSelected && "border-r-0",
								)}
							>
								Immediately
							</IconCheckbox>
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="inline-flex">
										<IconCheckbox
											icon={<CalendarIcon />}
											iconOrientation="left"
											variant="secondary"
											size="sm"
											checked={isEndOfCycleSelected}
											disabled={!hasOutgoing}
											onCheckedChange={() =>
												handleScheduleChange("end_of_cycle")
											}
											className={cn(
												"rounded-l-none",
												!isEndOfCycleSelected && "border-l-0",
											)}
										>
											End of cycle
										</IconCheckbox>
									</span>
								</TooltipTrigger>
								{!hasOutgoing && (
									<TooltipContent>
										Only available when transitioning from an existing plan
									</TooltipContent>
								)}
							</Tooltip>
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

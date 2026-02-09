import type { PlanTiming } from "@autumn/shared";
import {
	CalendarIcon,
	CaretDownIcon,
	LightningIcon,
} from "@phosphor-icons/react";
import type { Transition, Variants } from "motion/react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import {
	STAGGER_CONTAINER,
	STAGGER_ITEM,
} from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import {
	LAYOUT_TRANSITION,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";
import { useAttachFormContext } from "../context/AttachFormProvider";

const ACCORDION_EASE = [0.32, 0.72, 0, 1] as const;

const ACCORDION_EXPAND: Transition = {
	duration: 0.35,
	ease: ACCORDION_EASE,
};

const ACCORDION_COLLAPSE: Transition = {
	duration: 0.25,
	ease: ACCORDION_EASE,
	delay: 0.1,
};

const ACCORDION_CONTENT: Variants = {
	hidden: {
		transition: { staggerChildren: 0.04, staggerDirection: -1 },
	},
	visible: {
		transition: { delayChildren: 0.15, staggerChildren: 0.06 },
	},
};

const ACCORDION_ITEM: Variants = {
	hidden: {
		opacity: 0,
		y: -4,
		transition: { duration: 0.12, ease: ACCORDION_EASE },
	},
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.25, ease: ACCORDION_EASE },
	},
};

export function AttachAdvancedSection() {
	const [isOpen, setIsOpen] = useState(false);
	const { form, formValues, previewQuery } = useAttachFormContext();
	const { planSchedule } = formValues;
	const previewData = previewQuery.data;

	const defaultPlanSchedule = useMemo((): PlanTiming => {
		if (!previewData) return "immediate";

		const hasOutgoing = previewData.outgoing.length > 0;
		if (!hasOutgoing) return "immediate";

		const incomingPrice = previewData.incoming[0]?.plan.price?.amount ?? 0;
		const outgoingPrice = previewData.outgoing[0]?.plan.price?.amount ?? 0;
		const isUpgrade = incomingPrice > outgoingPrice;

		return isUpgrade ? "immediate" : "end_of_cycle";
	}, [previewData]);

	const effectivePlanSchedule = planSchedule ?? defaultPlanSchedule;
	const hasCustomSchedule =
		planSchedule !== null && planSchedule !== defaultPlanSchedule;

	const handleScheduleChange = (value: PlanTiming) => {
		form.setFieldValue("planSchedule", value);
	};

	const isImmediateSelected = effectivePlanSchedule === "immediate";
	const isEndOfCycleSelected = effectivePlanSchedule === "end_of_cycle";

	return (
		<SheetSection withSeparator>
			<motion.div
				layout
				transition={{ layout: LAYOUT_TRANSITION }}
				initial="hidden"
				animate="visible"
				variants={STAGGER_CONTAINER}
			>
				<motion.div
					layout
					transition={{ layout: LAYOUT_TRANSITION }}
					variants={STAGGER_ITEM}
				>
					<button
						type="button"
						onClick={() => setIsOpen((prev) => !prev)}
						className="flex items-center justify-between w-full cursor-pointer select-none"
					>
						<h3 className="text-sub flex items-center gap-2">
							Advanced
							<AnimatePresence>
								{hasCustomSchedule && (
									<Tooltip>
										<TooltipTrigger asChild>
											<motion.span
												initial={{ opacity: 0, scale: 0 }}
												animate={{ opacity: 1, scale: 1 }}
												exit={{ opacity: 0, scale: 0 }}
												transition={{ duration: 0.15 }}
												className="size-1.5 rounded-full bg-blue-400"
											/>
										</TooltipTrigger>
										<TooltipContent>
											Plan schedule set to{" "}
											{isImmediateSelected ? "Immediate" : "End of cycle"}
										</TooltipContent>
									</Tooltip>
								)}
							</AnimatePresence>
						</h3>
						<motion.span
							animate={{ rotate: isOpen ? 180 : 0 }}
							transition={{ duration: 0.2 }}
							className="text-t3"
						>
							<CaretDownIcon size={12} />
						</motion.span>
					</button>
				</motion.div>

				<AnimatePresence initial={false}>
					{isOpen && (
						<motion.div
							layout
							initial={{ height: 0 }}
							animate={{
								height: "auto",
								transition: {
									height: ACCORDION_EXPAND,
									layout: LAYOUT_TRANSITION,
								},
							}}
							exit={{
								height: 0,
								transition: {
									height: ACCORDION_COLLAPSE,
									layout: LAYOUT_TRANSITION,
								},
							}}
							className="overflow-hidden"
						>
							<motion.div
								className="pt-2 space-y-2"
								initial="hidden"
								animate="visible"
								exit="hidden"
								variants={ACCORDION_CONTENT}
							>
								<motion.div variants={ACCORDION_ITEM}>
									<div className="flex items-center justify-between px-3 h-10 rounded-xl input-base">
										<span className="text-sm text-t2">Plan Schedule</span>
										<div className="flex">
											<IconCheckbox
												icon={<LightningIcon />}
												iconOrientation="left"
												variant="secondary"
												size="sm"
												checked={isImmediateSelected}
												onCheckedChange={() =>
													handleScheduleChange("immediate")
												}
												className={cn(
													"rounded-r-none",
													!isImmediateSelected && "border-r-0",
												)}
											>
												Immediately
											</IconCheckbox>
											<IconCheckbox
												icon={<CalendarIcon />}
												iconOrientation="left"
												variant="secondary"
												size="sm"
												checked={isEndOfCycleSelected}
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
										</div>
									</div>
								</motion.div>
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>
		</SheetSection>
	);
}

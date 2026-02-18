import {
	CalendarIcon,
	CalendarXIcon,
	CaretDownIcon,
	LightningIcon,
	PlusIcon,
	SquareSplitHorizontalIcon,
	UniteIcon,
} from "@phosphor-icons/react";
import type { Transition, Variants } from "motion/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import {
	STAGGER_CONTAINER,
	STAGGER_ITEM,
} from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { IconButton } from "@/components/v2/buttons/IconButton";
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
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { cn } from "@/lib/utils";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { usePlanScheduleField } from "../hooks/usePlanScheduleField";
import { addDiscount } from "../utils/discountUtils";
import { AttachDiscountRow } from "./AttachDiscountRow";

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
	const { form, formValues, product } = useAttachFormContext();
	const { discounts, newBillingSubscription } = formValues;
	const { entityId } = useEntity();

	const {
		hasActiveSubscription,
		hasOutgoing,
		showBillingBehavior,
		effectiveBillingBehavior,
		hasCustomSchedule,
		hasCustomBilling,
		isImmediateSelected,
		isEndOfCycleSelected,
		handleScheduleChange,
		handleBillingBehaviorChange,
	} = usePlanScheduleField();

	// Show separate subscription toggle for add-ons or entity-scoped attaches
	const showNewBillingSubscription = !!product?.is_add_on || !!entityId;

	const hasDiscounts = discounts.some((d) => {
		if ("reward_id" in d) return d.reward_id !== "";
		if ("promotion_code" in d) return d.promotion_code !== "";
		return false;
	});
	const hasCustomSettings =
		(hasActiveSubscription && (hasCustomSchedule || hasCustomBilling)) ||
		newBillingSubscription ||
		hasDiscounts;

	const handleAddDiscount = () => {
		form.setFieldValue("discounts", addDiscount(discounts));
	};

	const getCustomSettingsTooltip = (): string => {
		const parts: string[] = [];

		if (hasCustomSchedule) {
			parts.push(
				`Plan schedule: ${isImmediateSelected ? "Immediate" : "End of cycle"}`,
			);
		}

		if (hasCustomBilling) {
			parts.push(
				`Billing: ${effectiveBillingBehavior === "next_cycle_only" ? "No Charges" : "Prorate"}`,
			);
		}

		if (newBillingSubscription) {
			parts.push("Create New Cycle");
		}

		if (hasDiscounts) {
			const validCount = discounts.filter((d) => {
				if ("reward_id" in d) return d.reward_id !== "";
				if ("promotion_code" in d) return d.promotion_code !== "";
				return false;
			}).length;
			parts.push(`${validCount} discount${validCount > 1 ? "s" : ""}`);
		}

		return parts.join(" • ");
	};

	return (
		<SheetSection withSeparator>
			<motion.div
				layout="position"
				layoutDependency={formValues.productId}
				transition={{ layout: LAYOUT_TRANSITION }}
				initial="hidden"
				animate="visible"
				variants={STAGGER_CONTAINER}
			>
				<motion.div variants={STAGGER_ITEM}>
					<button
						type="button"
						onClick={() => setIsOpen((prev) => !prev)}
						className="flex items-center justify-between w-full cursor-pointer select-none"
					>
						<h3 className="text-sub flex items-center gap-2">
							Advanced
							<AnimatePresence>
								{hasCustomSettings && (
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
											{getCustomSettingsTooltip()}
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
							initial={{ height: 0 }}
							animate={{
								height: "auto",
								transition: {
									height: ACCORDION_EXPAND,
								},
							}}
							exit={{
								height: 0,
								transition: {
									height: ACCORDION_COLLAPSE,
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
								{/* Plan Schedule — only when customer has an active Stripe subscription */}
								{hasActiveSubscription && (
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
															Only available when transitioning from an existing
															plan
														</TooltipContent>
													)}
												</Tooltip>
											</div>
										</div>
									</motion.div>
								)}

								{/* Billing Behavior — only when plan schedule is immediate and subscription exists */}
								{showBillingBehavior && (
									<motion.div variants={ACCORDION_ITEM}>
										<div className="flex items-center justify-between px-3 h-10 rounded-xl input-base">
											<span className="text-sm text-t2">Billing Behavior</span>
											<div className="flex">
												<IconCheckbox
													icon={<LightningIcon />}
													iconOrientation="left"
													variant="secondary"
													size="sm"
													checked={
														effectiveBillingBehavior === "prorate_immediately"
													}
													onCheckedChange={() =>
														handleBillingBehaviorChange("prorate_immediately")
													}
													className={cn(
														"rounded-r-none",
														effectiveBillingBehavior !==
															"prorate_immediately" && "border-r-0",
													)}
												>
													Prorate
												</IconCheckbox>
												<IconCheckbox
													icon={<CalendarXIcon />}
													iconOrientation="left"
													variant="secondary"
													size="sm"
													checked={
														effectiveBillingBehavior === "next_cycle_only"
													}
													onCheckedChange={() =>
														handleBillingBehaviorChange("next_cycle_only")
													}
													className={cn(
														"rounded-l-none",
														effectiveBillingBehavior !== "next_cycle_only" &&
															"border-l-0",
													)}
												>
													No Charges
												</IconCheckbox>
											</div>
										</div>
									</motion.div>
								)}

								{/* Billing Subscription — only for add-ons or entity attaches */}
								{showNewBillingSubscription && (
									<motion.div variants={ACCORDION_ITEM}>
										<div className="flex items-center justify-between px-3 h-10 rounded-xl input-base">
											<span className="text-sm text-t2">Billing Cycle</span>
											<div className="flex">
												<IconCheckbox
													icon={<UniteIcon />}
													iconOrientation="left"
													variant="secondary"
													size="sm"
													checked={!newBillingSubscription}
													onCheckedChange={() =>
														form.setFieldValue("newBillingSubscription", false)
													}
													className={cn(
														"rounded-r-none",
														newBillingSubscription && "border-r-0",
													)}
												>
													Merge With Existing
												</IconCheckbox>
												<IconCheckbox
													icon={<SquareSplitHorizontalIcon />}
													iconOrientation="left"
													variant="secondary"
													size="sm"
													checked={newBillingSubscription}
													onCheckedChange={() =>
														form.setFieldValue("newBillingSubscription", true)
													}
													className={cn(
														"rounded-l-none",
														!newBillingSubscription && "border-l-0",
													)}
												>
													Create New Cycle
												</IconCheckbox>
											</div>
										</div>
									</motion.div>
								)}

								{/* Discounts */}
								<motion.div variants={ACCORDION_ITEM}>
									<div className="rounded-xl input-base px-3 py-2">
										<div className="flex items-center justify-between h-6">
											<span className="text-sm text-t2">Discounts</span>
											<IconButton
												variant="muted"
												size="sm"
												onClick={handleAddDiscount}
												icon={<PlusIcon size={12} />}
												className="text-t3"
											>
												Add
											</IconButton>
										</div>
										{discounts.length > 0 && (
											<div className="mt-2 pt-2 border-t border-border space-y-2">
												<AnimatePresence initial={false} mode="popLayout">
													{discounts.map((discount, index) => (
														<motion.div
															key={discount._id}
															initial={{ opacity: 0, scale: 0.95 }}
															animate={{ opacity: 1, scale: 1 }}
															exit={{ opacity: 0, scale: 0.95 }}
															transition={{ duration: 0.15 }}
														>
															<AttachDiscountRow index={index} />
														</motion.div>
													))}
												</AnimatePresence>
											</div>
										)}
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

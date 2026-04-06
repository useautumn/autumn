import {
	ArrowsClockwiseIcon,
	CalendarIcon,
	CalendarXIcon,
	LightningIcon,
	LinkIcon,
	PlusIcon,
	ProhibitIcon,
	ScalesIcon,
	SquareSplitHorizontalIcon,
	UniteIcon,
	XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import {
	ACCORDION_ITEM,
	AdvancedSection,
	AdvancedToggleRow,
} from "@/components/forms/shared/advanced-section";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import { Input } from "@/components/v2/inputs/Input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";
import type { FormCustomLineItem } from "../attachFormSchema";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { usePlanScheduleField } from "../hooks/usePlanScheduleField";
import { addDiscount } from "../utils/discountUtils";
import { AttachDiscountRow } from "./AttachDiscountRow";

let customLineItemCounter = 0;

function createCustomLineItem(): FormCustomLineItem {
	return {
		_id: `cli_${Date.now()}_${customLineItemCounter++}`,
		amount: "",
		description: "",
	};
}

export function AttachAdvancedSection() {
	const { form, formValues, previewQuery } = useAttachFormContext();
	const {
		discounts,
		newBillingSubscription,
		redirectMode,
		noBillingChanges,
		carryOverBalances,
		carryOverUsages,
		processorSubscriptionId,
		customLineItems,
	} = formValues;
	const checkoutType = previewQuery.data?.checkout_type;

	const {
		hasActiveSubscription,
		hasOutgoing,
		showProrationBehavior,
		effectiveProrationBehavior,
		isImmediateSelected,
		isEndOfCycleSelected,
		isNoChargesAllowed,
		noChargesDisabledReason,
		canChooseBillingCycle,
		handleScheduleChange,
		handleBillingCycleChange,
		handleProrationBehaviorChange,
	} = usePlanScheduleField();

	const showRedirectModeRow =
		checkoutType === "autumn_checkout" || checkoutType === null;

	const handleAddDiscount = () => {
		form.setFieldValue("discounts", addDiscount(discounts));
	};

	const handleAddCustomLineItem = () => {
		form.setFieldValue("customLineItems", [
			...customLineItems,
			createCustomLineItem(),
		]);
	};

	const handleRemoveCustomLineItem = ({ index }: { index: number }) => {
		form.setFieldValue(
			"customLineItems",
			customLineItems.filter((_, i) => i !== index),
		);
	};

	const handleUpdateCustomLineItem = ({
		index,
		field,
		value,
	}: {
		index: number;
		field: "amount" | "description";
		value: string;
	}) => {
		const updated = [...customLineItems];
		if (field === "amount") {
			updated[index] = {
				...updated[index],
				amount: value === "" ? "" : Number(value),
			};
		} else {
			updated[index] = { ...updated[index], [field]: value };
		}
		form.setFieldValue("customLineItems", updated);
	};

	const moreOptions = (
		<>
			{showRedirectModeRow && (
				<motion.div variants={ACCORDION_ITEM}>
					<div className="rounded-xl input-base px-3 py-2">
						<div className="flex items-center justify-between gap-3">
							<span className="text-sm text-t2">Checkout Redirect</span>
							<div className="flex shrink-0">
								<IconCheckbox
									variant="secondary"
									size="sm"
									checked={redirectMode === "if_required"}
									onCheckedChange={() =>
										form.setFieldValue("redirectMode", "if_required")
									}
									className={cn(
										"min-w-[76px] px-2 text-xs rounded-r-none",
										redirectMode !== "if_required" && "border-r-0",
									)}
								>
									Auto
								</IconCheckbox>
								<IconCheckbox
									variant="secondary"
									size="sm"
									checked={redirectMode === "always"}
									onCheckedChange={() =>
										form.setFieldValue("redirectMode", "always")
									}
									className={cn(
										"min-w-[76px] px-2 text-xs rounded-l-none",
										redirectMode !== "always" && "border-l-0",
									)}
								>
									Always
								</IconCheckbox>
							</div>
						</div>
					</div>
				</motion.div>
			)}

			<AdvancedToggleRow label="No Billing Operation">
				<IconCheckbox
					icon={<ProhibitIcon />}
					iconOrientation="left"
					variant="secondary"
					size="sm"
					checked={noBillingChanges}
					onCheckedChange={(checked) =>
						form.setFieldValue("noBillingChanges", !!checked)
					}
					className="px-2 text-xs"
				>
					Skip Billing
				</IconCheckbox>
			</AdvancedToggleRow>

			<AdvancedToggleRow label="Carry Over Balances">
				<IconCheckbox
					icon={<ScalesIcon />}
					iconOrientation="left"
					variant="secondary"
					size="sm"
					checked={carryOverBalances}
					onCheckedChange={(checked) =>
						form.setFieldValue("carryOverBalances", !!checked)
					}
					className="px-2 text-xs"
				>
					Enabled
				</IconCheckbox>
			</AdvancedToggleRow>

			<AdvancedToggleRow label="Carry Over Usages">
				<IconCheckbox
					icon={<ArrowsClockwiseIcon />}
					iconOrientation="left"
					variant="secondary"
					size="sm"
					checked={carryOverUsages}
					onCheckedChange={(checked) =>
						form.setFieldValue("carryOverUsages", !!checked)
					}
					className="px-2 text-xs"
				>
					Enabled
				</IconCheckbox>
			</AdvancedToggleRow>

			<motion.div variants={ACCORDION_ITEM}>
				<div className="rounded-xl input-base px-3 py-2">
					<div className="flex items-center justify-between gap-3">
						<span className="text-sm text-t2 flex items-center gap-1.5">
							<LinkIcon size={14} className="text-t3" />
							Processor Subscription ID
						</span>
					</div>
					<div className="mt-2">
						<Input
							placeholder="sub_..."
							value={processorSubscriptionId}
							onChange={(e) =>
								form.setFieldValue("processorSubscriptionId", e.target.value)
							}
							className="h-8 text-xs"
						/>
					</div>
				</div>
			</motion.div>

			<motion.div variants={ACCORDION_ITEM}>
				<div className="rounded-xl input-base px-3 py-2">
					<div className="flex items-center justify-between h-6">
						<span className="text-sm text-t2">Custom Line Items</span>
						<IconButton
							variant="muted"
							size="sm"
							onClick={handleAddCustomLineItem}
							icon={<PlusIcon size={12} />}
							className="text-t3"
						>
							Add
						</IconButton>
					</div>
					{customLineItems.length > 0 && (
						<div className="mt-2 pt-2 border-t border-border space-y-2">
							<AnimatePresence initial={false} mode="popLayout">
								{customLineItems.map((lineItem, index) => (
									<motion.div
										key={lineItem._id}
										initial={{ opacity: 0, scale: 0.95 }}
										animate={{ opacity: 1, scale: 1 }}
										exit={{ opacity: 0, scale: 0.95 }}
										transition={{ duration: 0.15 }}
									>
										<div className="flex items-center gap-2">
											<Input
												type="number"
												placeholder="Amount ($)"
												value={lineItem.amount}
												onChange={(e) =>
													handleUpdateCustomLineItem({
														index,
														field: "amount",
														value: e.target.value,
													})
												}
												className="h-7 text-xs w-24 shrink-0"
											/>
											<Input
												placeholder="Description"
												value={lineItem.description}
												onChange={(e) =>
													handleUpdateCustomLineItem({
														index,
														field: "description",
														value: e.target.value,
													})
												}
												className="h-7 text-xs flex-1"
											/>
											<IconButton
												variant="muted"
												size="sm"
												onClick={() => handleRemoveCustomLineItem({ index })}
												icon={<XIcon size={12} />}
												className="shrink-0 text-t3 hover:text-red-500"
											/>
										</div>
									</motion.div>
								))}
							</AnimatePresence>
						</div>
					)}
				</div>
			</motion.div>
		</>
	);

	return (
		<AdvancedSection moreOptions={moreOptions}>
			{/* Plan Schedule — only when customer has an active Stripe subscription */}
			{hasActiveSubscription && (
				<AdvancedToggleRow label="Plan Schedule">
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
									onCheckedChange={() => handleScheduleChange("end_of_cycle")}
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
				</AdvancedToggleRow>
			)}

			{/* Billing Cycle — shown when this attach can target an existing paid recurring cycle */}
			{canChooseBillingCycle && (
				<AdvancedToggleRow label="Billing Cycle">
					<IconCheckbox
						icon={<UniteIcon />}
						iconOrientation="left"
						variant="secondary"
						size="sm"
						checked={!newBillingSubscription}
						onCheckedChange={() =>
							handleBillingCycleChange({
								createNewCycle: false,
							})
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
							handleBillingCycleChange({
								createNewCycle: true,
							})
						}
						className={cn(
							"rounded-l-none",
							!newBillingSubscription && "border-l-0",
						)}
					>
						Create New Cycle
					</IconCheckbox>
				</AdvancedToggleRow>
			)}

			{/* Proration Behavior — only when plan schedule is immediate and subscription exists */}
			{showProrationBehavior && (
				<AdvancedToggleRow label="Proration Behavior">
					<IconCheckbox
						icon={<LightningIcon />}
						iconOrientation="left"
						variant="secondary"
						size="sm"
						checked={effectiveProrationBehavior === "prorate_immediately"}
						onCheckedChange={() =>
							handleProrationBehaviorChange("prorate_immediately")
						}
						className={cn(
							"rounded-r-none",
							effectiveProrationBehavior !== "prorate_immediately" &&
								"border-r-0",
						)}
					>
						Prorate
					</IconCheckbox>
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="inline-flex">
								<IconCheckbox
									icon={<CalendarXIcon />}
									iconOrientation="left"
									variant="secondary"
									size="sm"
									checked={effectiveProrationBehavior === "none"}
									disabled={!isNoChargesAllowed}
									onCheckedChange={() => handleProrationBehaviorChange("none")}
									className={cn(
										"rounded-l-none",
										effectiveProrationBehavior !== "none" && "border-l-0",
									)}
								>
									No Charges
								</IconCheckbox>
							</span>
						</TooltipTrigger>
						{!isNoChargesAllowed && (
							<TooltipContent>{noChargesDisabledReason}</TooltipContent>
						)}
					</Tooltip>
				</AdvancedToggleRow>
			)}

			{/* Discounts */}
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
		</AdvancedSection>
	);
}

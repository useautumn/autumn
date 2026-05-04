import {
	type Feature,
	type FullCustomer,
	isFreeProductV2,
	isOneOffProductV2,
} from "@autumn/shared";
import { CaretDownIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { addDays } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import {
	AdvancedSection,
	AdvancedToggleRow,
	ConfigRow,
} from "@/components/forms/shared/advanced-section";
import { DateInputUnix } from "@/components/general/DateInputUnix";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { Input } from "@/components/v2/inputs/Input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
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

function FeatureSelectDropdown({
	features,
	selectedFeatureIds,
	onChange,
}: {
	features: Feature[];
	selectedFeatureIds: string[];
	onChange: ({ featureIds }: { featureIds: string[] }) => void;
}) {
	const isAllSelected = selectedFeatureIds.length === 0;
	const [open, setOpen] = useState(false);

	const label = isAllSelected
		? "All Features"
		: `${selectedFeatureIds.length} feature${selectedFeatureIds.length !== 1 ? "s" : ""} selected`;

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="secondary"
					size="mini"
					className={cn(
						"gap-1 w-full justify-between",
						open && "btn-secondary-active",
					)}
				>
					{label}
					<CaretDownIcon className="size-3.5 text-t3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-48">
				<DropdownMenuCheckboxItem
					checked={isAllSelected}
					onCheckedChange={() => onChange({ featureIds: [] })}
				>
					All Features
				</DropdownMenuCheckboxItem>
				{features.length > 0 && <DropdownMenuSeparator />}
				{features.map((feature) => {
					const isChecked = selectedFeatureIds.includes(feature.id);
					return (
						<DropdownMenuCheckboxItem
							key={feature.id}
							checked={isChecked}
							onCheckedChange={(checked) => {
								const newIds = checked
									? [...selectedFeatureIds, feature.id]
									: selectedFeatureIds.filter((id) => id !== feature.id);
								onChange({ featureIds: newIds });
							}}
						>
							{feature.name}
						</DropdownMenuCheckboxItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function AttachAdvancedSection() {
	const { form, formValues, features, product } = useAttachFormContext();
	const {
		discounts,
		newBillingSubscription,
		resetBillingCycle,
		noBillingChanges,
		enablePlanImmediately,
		carryOverBalances,
		carryOverBalanceFeatureIds,
		carryOverUsages,
		carryOverUsageFeatureIds,
		customLineItems,
		trialEnabled,
		startDate,
	} = formValues;
	const { customer } = useCusQuery();
	const fullCustomer = customer as FullCustomer | null;

	const hasCustomerEntitlements = useMemo(() => {
		if (!fullCustomer) return false;

		const hasProductEntitlements = fullCustomer.customer_products?.some(
			(customerProduct) => customerProduct.customer_entitlements?.length > 0,
		);
		const hasExtraEntitlements =
			fullCustomer.extra_customer_entitlements?.length > 0;

		return hasProductEntitlements || hasExtraEntitlements;
	}, [fullCustomer]);

	const [overrideLineItemsEnabled, setOverrideLineItemsEnabled] = useState(
		customLineItems.length > 0,
	);
	const {
		hasActiveSubscription,
		hasOutgoing,
		effectivePlanSchedule,
		showProrationRow,
		showProrationBehavior,
		effectiveProrationBehavior,
		isImmediateSelected,
		isEndOfCycleSelected,
		isNoChargesAllowed,
		canChooseBillingCycle,
		handleScheduleChange,
		handleBillingCycleChange,
		handleProrationBehaviorChange,
	} = usePlanScheduleField();

	const isPaidRecurringProduct =
		!!product &&
		!isFreeProductV2({ items: product.items }) &&
		!isOneOffProductV2({ items: product.items });

	const showStartDate =
		isPaidRecurringProduct &&
		!hasActiveSubscription &&
		!trialEnabled &&
		effectivePlanSchedule !== "end_of_cycle";

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
			{showStartDate && (
				<ConfigRow
					title="Start Date"
					description="Schedule the plan to start on a future date"
					expanded={startDate !== null}
					action={
						<Switch
							checked={startDate !== null}
							onCheckedChange={(checked) =>
								form.setFieldValue(
									"startDate",
									checked ? addDays(Date.now(), 1).getTime() : null,
								)
							}
						/>
					}
				>
					<DateInputUnix
						unixDate={startDate}
						setUnixDate={(value) => form.setFieldValue("startDate", value)}
						disablePastDates
						minUnixDate={Date.now()}
						withTime
					/>
				</ConfigRow>
			)}

			{hasCustomerEntitlements && (
				<ConfigRow
					title="Carry Over Balances"
					description="Preserve existing feature balances when switching plans"
					expanded={carryOverBalances}
					action={
						<Switch
							checked={carryOverBalances}
							onCheckedChange={(checked) => {
								form.setFieldValue("carryOverBalances", !!checked);
								if (!checked)
									form.setFieldValue("carryOverBalanceFeatureIds", []);
							}}
						/>
					}
				>
					<FeatureSelectDropdown
						features={features}
						selectedFeatureIds={carryOverBalanceFeatureIds}
						onChange={({ featureIds }) =>
							form.setFieldValue("carryOverBalanceFeatureIds", featureIds)
						}
					/>
				</ConfigRow>
			)}

			{hasCustomerEntitlements && (
				<ConfigRow
					title="Carry Over Usages"
					description="Preserve existing usage counts when switching plans"
					expanded={carryOverUsages}
					action={
						<Switch
							checked={carryOverUsages}
							onCheckedChange={(checked) => {
								form.setFieldValue("carryOverUsages", !!checked);
								if (!checked)
									form.setFieldValue("carryOverUsageFeatureIds", []);
							}}
						/>
					}
				>
					<FeatureSelectDropdown
						features={features}
						selectedFeatureIds={carryOverUsageFeatureIds}
						onChange={({ featureIds }) =>
							form.setFieldValue("carryOverUsageFeatureIds", featureIds)
						}
					/>
				</ConfigRow>
			)}

			<ConfigRow
				title="Override Line Items"
				description="Replace default invoice line items with custom amounts"
				expanded={overrideLineItemsEnabled}
				action={
					<Switch
						checked={overrideLineItemsEnabled}
						onCheckedChange={(checked) => {
							setOverrideLineItemsEnabled(!!checked);
							if (!checked) form.setFieldValue("customLineItems", []);
						}}
					/>
				}
			>
				<div className="flex flex-col gap-2">
					<div className="flex justify-end">
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
						<div className="space-y-2">
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
			</ConfigRow>

			{canChooseBillingCycle && (
				<ConfigRow
					title="New Billing Subscription"
					description="Create a separate billing cycle instead of merging with existing"
					action={
						<Switch
							checked={newBillingSubscription}
							onCheckedChange={(checked) =>
								handleBillingCycleChange({
									createNewCycle: !!checked,
								})
							}
						/>
					}
				/>
			)}

			{hasActiveSubscription && (
				<ConfigRow
					title="Reset Billing Cycle"
					description="Restart the billing cycle from today"
					action={
						<Switch
							checked={resetBillingCycle}
							onCheckedChange={(checked) => {
								form.setFieldValue("resetBillingCycle", !!checked);
								if (checked) {
									handleScheduleChange("immediate");
								}
							}}
						/>
					}
				/>
			)}

			<ConfigRow
				title="Skip Billing"
				description="Attach the plan without making changes in Stripe"
				action={
					<Switch
						checked={noBillingChanges}
						onCheckedChange={(checked) =>
							form.setFieldValue("noBillingChanges", !!checked)
						}
					/>
				}
			/>

			<ConfigRow
				title="Enable Plan Immediately"
				description="Grant access as soon as the checkout session is created, before payment is completed"
				action={
					<Switch
						checked={enablePlanImmediately}
						onCheckedChange={(checked) =>
							form.setFieldValue("enablePlanImmediately", !!checked)
						}
					/>
				}
			/>
		</>
	);

	return (
		<AdvancedSection moreOptions={moreOptions}>
			{/* Discounts */}
			<ConfigRow
				title="Discounts"
				description="Apply percentage or fixed-amount discounts to this plan"
				action={
					<IconButton
						variant="muted"
						size="sm"
						onClick={handleAddDiscount}
						icon={<PlusIcon size={12} />}
						className="text-t3"
					>
						Add
					</IconButton>
				}
			>
				{discounts.length > 0 && (
					<div className="space-y-2">
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
			</ConfigRow>

			{showProrationRow && (
				<ConfigRow
					title="Prorate Changes"
					description="Prorate price differences when changing plans mid-cycle"
					action={
						<Switch
							checked={
								showProrationBehavior &&
								effectiveProrationBehavior === "prorate_immediately"
							}
							disabled={!showProrationBehavior || !isNoChargesAllowed}
							onCheckedChange={(checked) =>
								handleProrationBehaviorChange(
									checked ? "prorate_immediately" : "none",
								)
							}
						/>
					}
				/>
			)}

			{/* Plan Schedule — only when customer has an active Stripe subscription */}
			{hasActiveSubscription && (
				<AdvancedToggleRow
					label="Plan Schedule"
					description="When the new plan should take effect"
				>
					<IconCheckbox
						variant="secondary"
						size="sm"
						checked={isImmediateSelected || resetBillingCycle}
						disabled={resetBillingCycle}
						onCheckedChange={() => handleScheduleChange("immediate")}
						className={cn(
							"min-w-[76px] px-2 text-xs rounded-r-none",
							!isImmediateSelected && !resetBillingCycle && "border-r-0",
						)}
					>
						Immediately
					</IconCheckbox>
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="inline-flex">
								<IconCheckbox
									variant="secondary"
									size="sm"
									checked={isEndOfCycleSelected && !resetBillingCycle}
									disabled={!hasOutgoing || resetBillingCycle}
									onCheckedChange={() => handleScheduleChange("end_of_cycle")}
									className={cn(
										"min-w-[76px] px-2 text-xs rounded-l-none",
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
		</AdvancedSection>
	);
}

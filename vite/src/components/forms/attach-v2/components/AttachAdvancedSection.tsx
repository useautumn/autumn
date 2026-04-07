import type { Feature, FullCustomer } from "@autumn/shared";
import { CaretDownIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import {
	AdvancedSection,
	AdvancedToggleRow,
	ConfigRow,
} from "@/components/forms/shared/advanced-section";
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
	const { form, formValues, features, previewQuery } = useAttachFormContext();
	const {
		discounts,
		newBillingSubscription,
		redirectMode,
		noBillingChanges,
		carryOverBalances,
		carryOverBalanceFeatureIds,
		carryOverUsages,
		carryOverUsageFeatureIds,
		customLineItems,
	} = formValues;
	const checkoutType = previewQuery.data?.checkout_type;

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

			{showRedirectModeRow && (
				<ConfigRow
					title="Checkout Redirect"
					description="Control when the customer is redirected to a checkout page"
					action={
						<>
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
						</>
					}
				/>
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

			{/* Proration — only when plan schedule is immediate and subscription exists */}
			{showProrationBehavior && (
				<ConfigRow
					title="Prorate Changes"
					description="Prorate price differences when changing plans mid-cycle"
					action={
						<Switch
							checked={effectiveProrationBehavior === "prorate_immediately"}
							disabled={!isNoChargesAllowed}
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
						checked={isImmediateSelected}
						onCheckedChange={() => handleScheduleChange("immediate")}
						className={cn(
							"min-w-[76px] px-2 text-xs rounded-r-none",
							!isImmediateSelected && "border-r-0",
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
									checked={isEndOfCycleSelected}
									disabled={!hasOutgoing}
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

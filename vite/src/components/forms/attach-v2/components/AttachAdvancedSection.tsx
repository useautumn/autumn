import { isFreeProductV2, isOneOffProductV2 } from "@autumn/shared";
import {
	DateInputUnix,
	IconCheckbox,
	Switch,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { addDays } from "date-fns";
import { useState } from "react";
import {
	AdvancedSection,
	AdvancedToggleRow,
	ConfigRow,
} from "@/components/forms/shared/advanced-section";
import { BillingCycleAnchorConfigRow } from "@/components/forms/shared/BillingCycleAnchorConfigRow";
import { CarryOverConfigRow } from "@/components/forms/shared/CarryOverConfigRow";
import {
	addCustomLineItem,
	CustomLineItemRows,
	removeCustomLineItem,
	updateCustomLineItem,
} from "@/components/forms/shared/CustomLineItemRows";
import { AppliedDiscountRow } from "@/components/forms/shared/discount-row/AppliedDiscountRow";
import { DiscountsConfigRow } from "@/components/forms/shared/discount-row/DiscountsConfigRow";
import { EndDateConfigRow } from "@/components/forms/shared/EndDateConfigRow";
import { ProrationBehaviorConfigRow } from "@/components/forms/shared/ProrationBehaviorConfigRow";
import { getBillingOptionRules } from "@/components/forms/shared/utils/billingOptionRules";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { getAttachScheduledStartDate } from "../utils/buildAttachPreviewTotals";
import {
	addDiscount,
	removeDiscount,
	toggleRemovedRewardId,
	updateDiscount,
} from "../utils/discountUtils";

const BACKDATE_START_YEAR_LOOKBACK = 25;

export function AttachAdvancedSection() {
	const {
		form,
		customer,
		formValues,
		features,
		product,
		previewQuery,
		additionalPlans,
		billingOptions,
		appliedDiscounts,
	} = useAttachFormContext();
	const isMultiPlan = additionalPlans.isMultiPlan;
	const {
		discounts,
		removedRewardIds,
		newBillingSubscription,
		resetBillingCycle,
		billingCycleAnchorMode,
		billingCycleAnchorDate,
		noBillingChanges,
		chargeTax,
		carryOverBalances,
		carryOverBalanceFeatureIds,
		carryOverUsages,
		carryOverUsageFeatureIds,
		customLineItems,
		trialEnabled,
		startDate,
		endDate,
	} = formValues;
	const { org } = useOrg();
	const showChargeTax =
		!isMultiPlan && !noBillingChanges && Boolean(org?.config?.automatic_tax);
	const hasCustomerEntitlements =
		customer?.customer_products?.some(
			(customerProduct) => customerProduct.customer_entitlements?.length > 0,
		) || (customer?.extra_customer_entitlements?.length ?? 0) > 0;

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
		createsNewStripeSubscription,
		handleScheduleChange,
		handleBillingCycleChange,
		handleProrationBehaviorChange,
	} = billingOptions;

	const isPaidRecurringProduct =
		!!product &&
		!isFreeProductV2({ items: product.items }) &&
		!isOneOffProductV2({ items: product.items });

	const allowBackdatedStartDate = createsNewStripeSubscription;
	let startDateDescription = "Schedule the plan to start on a future date";
	if (allowBackdatedStartDate) {
		startDateDescription =
			"Start the new subscription on a past or future date";
	}
	if (isMultiPlan) {
		startDateDescription = "Backdate every plan to the same start date";
	}

	const rules = getBillingOptionRules({
		flow: "attach",
		state: {
			hasActiveSubscription,
			isMultiPlan,
			showProrationRow,
			showProrationBehavior,
			isNoChargesAllowed,
			hasCustomerEntitlements,
			canChooseBillingCycle,
			// A multi-plan attach only exposes a start date to backdate every plan
			// onto one new subscription.
			showStartDate:
				isPaidRecurringProduct &&
				!trialEnabled &&
				effectivePlanSchedule !== "end_of_cycle" &&
				(!isMultiPlan || createsNewStripeSubscription),
			showEndDate: !!product && !isFreeProductV2({ items: product.items }),
		},
	});
	const attachStartsAt =
		effectivePlanSchedule === "end_of_cycle"
			? getAttachScheduledStartDate({ previewData: previewQuery.data })
			: startDate;
	const endDateMin = Math.max(Date.now(), attachStartsAt ?? 0);
	const resetsBillingCycleNow =
		resetBillingCycle && billingCycleAnchorMode === "now";

	const handleAddDiscount = () => {
		form.setFieldValue("discounts", addDiscount(discounts));
	};

	const toggleRemovedReward = (rewardId: string) =>
		form.setFieldValue(
			"removedRewardIds",
			toggleRemovedRewardId({ removedRewardIds, rewardId }),
		);

	const handleAddCustomLineItem = () => {
		form.setFieldValue("customLineItems", addCustomLineItem(customLineItems));
	};

	const handleRemoveCustomLineItem = ({ index }: { index: number }) => {
		form.setFieldValue(
			"customLineItems",
			removeCustomLineItem(customLineItems, index),
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
		form.setFieldValue(
			"customLineItems",
			updateCustomLineItem({ lineItems: customLineItems, index, field, value }),
		);
	};

	const moreOptions = (
		<>
			{showChargeTax && (
				<ConfigRow
					title="Charge Tax"
					description="Calculate tax automatically via Stripe"
					action={
						<Switch
							checked={chargeTax}
							onCheckedChange={(checked) =>
								form.setFieldValue("chargeTax", !!checked)
							}
						/>
					}
				/>
			)}

			{rules.startDate.visible && (
				<ConfigRow
					title="Start Date"
					description={startDateDescription}
					expanded={startDate !== null}
					action={
						<Switch
							checked={startDate !== null}
							onCheckedChange={(checked) =>
								form.setFieldValue(
									"startDate",
									checked
										? addDays(Date.now(), isMultiPlan ? -1 : 1).getTime()
										: null,
								)
							}
						/>
					}
				>
					<DateInputUnix
						unixDate={startDate}
						setUnixDate={(value) => form.setFieldValue("startDate", value)}
						disablePastDates={!allowBackdatedStartDate}
						disableFutureDates={isMultiPlan}
						minUnixDate={allowBackdatedStartDate ? undefined : Date.now()}
						maxUnixDate={isMultiPlan ? Date.now() : undefined}
						fromYear={
							allowBackdatedStartDate
								? new Date().getFullYear() - BACKDATE_START_YEAR_LOOKBACK
								: undefined
						}
						withTime
					/>
				</ConfigRow>
			)}

			{rules.endDate.visible && (
				<EndDateConfigRow
					endDate={endDate}
					minUnixDate={endDateMin}
					onEndDateChange={(value) => form.setFieldValue("endDate", value)}
				/>
			)}

			{rules.carryOverBalances.visible && (
				<CarryOverConfigRow
					title="Carry Over Balances"
					description="Preserve existing feature balances when switching plans"
					features={features}
					value={{
						enabled: carryOverBalances,
						featureIds: carryOverBalanceFeatureIds,
					}}
					onChange={({ enabled, featureIds }) => {
						form.setFieldValue("carryOverBalances", enabled);
						form.setFieldValue("carryOverBalanceFeatureIds", featureIds);
					}}
				/>
			)}

			{rules.carryOverUsages.visible && (
				<CarryOverConfigRow
					title="Carry Over Usages"
					description="Preserve existing usage counts when switching plans"
					features={features}
					value={{
						enabled: carryOverUsages,
						featureIds: carryOverUsageFeatureIds,
					}}
					onChange={({ enabled, featureIds }) => {
						form.setFieldValue("carryOverUsages", enabled);
						form.setFieldValue("carryOverUsageFeatureIds", featureIds);
					}}
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
				<CustomLineItemRows
					lineItems={customLineItems}
					onAdd={handleAddCustomLineItem}
					onUpdate={handleUpdateCustomLineItem}
					onRemove={handleRemoveCustomLineItem}
				/>
			</ConfigRow>

			{rules.newBillingSubscription.visible && (
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

			{rules.resetBillingCycle.visible && (
				<BillingCycleAnchorConfigRow
					enabled={resetBillingCycle}
					mode={billingCycleAnchorMode}
					customAnchor={billingCycleAnchorDate}
					minUnixDate={endDateMin}
					maxUnixDate={endDate ? endDate - 1_000 : undefined}
					allowCustomAnchor={!isMultiPlan}
					onEnabledChange={(enabled) => {
						form.setFieldValue("resetBillingCycle", enabled);
						if (enabled && billingCycleAnchorMode === "now") {
							handleScheduleChange("immediate");
						}
					}}
					onModeChange={(mode) => {
						form.setFieldValue("billingCycleAnchorMode", mode);
						if (mode === "now" && resetBillingCycle) {
							handleScheduleChange("immediate");
						}
					}}
					onCustomAnchorChange={(anchor) =>
						form.setFieldValue("billingCycleAnchorDate", anchor)
					}
				/>
			)}

			{rules.skipBilling.visible && (
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
			)}
		</>
	);

	// A multi-plan attach drops "More Options" entirely unless something in it
	// is still visible.
	const hasMoreOptions =
		!isMultiPlan || rules.startDate.visible || rules.resetBillingCycle.visible;

	return (
		<AdvancedSection moreOptions={hasMoreOptions ? moreOptions : undefined}>
			<DiscountsConfigRow
				discounts={discounts}
				description="Apply percentage or fixed-amount discounts to this plan"
				productId={product?.id}
				onAdd={handleAddDiscount}
				onUpdate={({ index, rewardId }) =>
					form.setFieldValue(
						"discounts",
						updateDiscount(discounts, index, { reward_id: rewardId }),
					)
				}
				onRemove={({ index }) =>
					form.setFieldValue("discounts", removeDiscount(discounts, index))
				}
				excludedRewardIds={appliedDiscounts.map((discount) => discount.id)}
				appliedDiscounts={appliedDiscounts.map((discount) => (
					<AppliedDiscountRow
						key={discount.id}
						discount={discount}
						removed={removedRewardIds.includes(discount.id)}
						onToggleRemoved={() => toggleRemovedReward(discount.id)}
					/>
				))}
			/>

			{rules.proration.visible && (
				<ProrationBehaviorConfigRow
					rule={rules.proration}
					value={showProrationBehavior ? effectiveProrationBehavior : "none"}
					onChange={handleProrationBehaviorChange}
				/>
			)}

			{rules.planSchedule.visible && (
				<AdvancedToggleRow
					label="Plan Schedule"
					description="When the new plan should take effect"
				>
					<IconCheckbox
						variant="secondary"
						size="sm"
						checked={isImmediateSelected || resetsBillingCycleNow}
						disabled={resetsBillingCycleNow}
						onCheckedChange={() => handleScheduleChange("immediate")}
						className={cn(
							"min-w-[76px] px-2 text-xs rounded-r-none",
							!isImmediateSelected && !resetsBillingCycleNow && "border-r-0",
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
									checked={isEndOfCycleSelected && !resetsBillingCycleNow}
									disabled={!hasOutgoing || resetsBillingCycleNow}
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

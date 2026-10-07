import { isFreeProductV2, isOneOffProductV2 } from "@autumn/shared";
import { Switch } from "@autumn/ui";
import { BillingCycleAnchorConfigRow } from "@/components/forms/shared/BillingCycleAnchorConfigRow";
import { BillingOptionSections } from "@/components/forms/shared/billing-option-sections/BillingOptionSections";
import type { BillingOptionSummary } from "@/components/forms/shared/billing-option-sections/types/billingOptionSectionTypes";
import {
	anchorSummary,
	carryOverSummary,
	changedTo,
	dateSummary,
	discountsSummary,
	formatOptionDate,
	prorationSummary,
	renewsSummary,
	staysAs,
	switchSummary,
} from "@/components/forms/shared/billing-option-sections/utils/billingOptionSummaries";
import { CarryOverConfigRow } from "@/components/forms/shared/CarryOverConfigRow";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import {
	DISCOUNTS_FIELDS,
	DiscountsFieldGroup,
} from "@/components/forms/shared/discount-row/DiscountsFieldGroup";
import { EndDateConfigRow } from "@/components/forms/shared/EndDateConfigRow";
import { ProrationBehaviorConfigRow } from "@/components/forms/shared/ProrationBehaviorConfigRow";
import { getBillingOptionRules } from "@/components/forms/shared/utils/billingOptionRules";
import { useOrg } from "@/hooks/common/useOrg";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { getAttachScheduledStartDate } from "../utils/buildAttachPreviewTotals";
import { AttachOverrideLineItemsRow } from "./AttachOverrideLineItemsRow";
import { AttachPlanScheduleRow } from "./AttachPlanScheduleRow";
import { AttachStartDateRow } from "./AttachStartDateRow";

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
		createsRecurringSubscription,
		handleScheduleChange,
		handleBillingCycleChange,
		handleProrationBehaviorChange,
	} = billingOptions;

	const isPaidRecurringProduct =
		!!product &&
		!isFreeProductV2({ items: product.items }) &&
		!isOneOffProductV2({ items: product.items });

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
	const proration = showProrationBehavior ? effectiveProrationBehavior : "none";
	const scheduledStartsAt = getAttachScheduledStartDate({
		previewData: previewQuery.data,
	});
	const chargesFullPriceNow =
		!rules.proration.visible &&
		!isMultiPlan &&
		isPaidRecurringProduct &&
		!noBillingChanges &&
		!formValues.grantFree;
	let stripeOutcome: BillingOptionSummary = null;
	if (createsRecurringSubscription)
		stripeOutcome = staysAs("Creates subscription");
	else if (hasActiveSubscription)
		stripeOutcome = staysAs("Updates current subscription");
	const anchorMode = isMultiPlan ? "now" : billingCycleAnchorMode;

	return (
		<BillingOptionSections
			sections={{
				charges: [
					{
						id: "initialCharge",
						visible: chargesFullPriceNow,
						summary: staysAs(
							trialEnabled ? "Charged after trial" : "Full price now",
						),
					},
					{
						id: "discounts",
						visible: rules.discounts.visible,
						summary: discountsSummary({
							discounts,
							removedRewardIds,
							appliedCount: appliedDiscounts.length,
						}),
						row: (
							<DiscountsFieldGroup
								form={form}
								fields={DISCOUNTS_FIELDS}
								description="Apply percentage or fixed-amount discounts to this plan"
								productId={product?.id}
								appliedDiscounts={appliedDiscounts}
							/>
						),
					},
					{
						id: "proration",
						visible: rules.proration.visible,
						locked: rules.proration.disabled,
						summary: prorationSummary({
							value: proration,
							defaultValue: "none",
						}),
						row: (
							<ProrationBehaviorConfigRow
								rule={rules.proration}
								value={proration}
								onChange={handleProrationBehaviorChange}
							/>
						),
					},
					{
						id: "chargeTax",
						visible: showChargeTax,
						summary: chargeTax ? staysAs("Tax on") : changedTo("No tax"),
						row: (
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
						),
					},
					{
						id: "overrideLineItems",
						visible: rules.overrideLineItems.visible,
						summary: switchSummary({
							enabled: customLineItems.length > 0,
							changedText: "Custom line items",
						}),
						row: (
							<AttachOverrideLineItemsRow
								lineItems={customLineItems}
								onLineItemsChange={(lineItems) =>
									form.setFieldValue("customLineItems", lineItems)
								}
							/>
						),
					},
				],
				timing: [
					{
						id: "startsNow",
						visible:
							startDate === null && effectivePlanSchedule !== "end_of_cycle",
						summary: staysAs("Starts now"),
					},
					{
						id: "planSchedule",
						visible: rules.planSchedule.visible,
						locked: resetsBillingCycleNow,
						summary: isEndOfCycleSelected
							? changedTo(
									scheduledStartsAt
										? `End of cycle (${formatOptionDate(scheduledStartsAt)})`
										: "End of cycle",
								)
							: null,
						row: (
							<AttachPlanScheduleRow
								isImmediateSelected={isImmediateSelected}
								isEndOfCycleSelected={isEndOfCycleSelected}
								hasOutgoing={hasOutgoing}
								locked={resetsBillingCycleNow}
								onChange={handleScheduleChange}
							/>
						),
					},
					{
						id: "startDate",
						visible: rules.startDate.visible,
						summary:
							startDate === null
								? null
								: changedTo(
										`${startDate < Date.now() ? "Backdated to" : "Starts"} ${formatOptionDate(startDate)}`,
									),
						row: (
							<AttachStartDateRow
								startDate={startDate}
								isMultiPlan={isMultiPlan}
								allowBackdate={createsNewStripeSubscription}
								onStartDateChange={(value) =>
									form.setFieldValue("startDate", value)
								}
							/>
						),
					},
					{
						id: "endDate",
						visible: rules.endDate.visible,
						summary: dateSummary({ label: "Ends", date: endDate }),
						row: (
							<EndDateConfigRow
								endDate={endDate}
								minUnixDate={endDateMin}
								onEndDateChange={(value) =>
									form.setFieldValue("endDate", value)
								}
							/>
						),
					},
					{
						id: "resetBillingCycle",
						visible: rules.resetBillingCycle.visible,
						summary: anchorSummary({
							enabled: resetBillingCycle,
							mode: anchorMode,
							customAnchor: billingCycleAnchorDate,
						}),
						row: (
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
						),
					},
					{
						id: "renews",
						visible: !isEndOfCycleSelected,
						summary: renewsSummary({
							startsAt: previewQuery.data?.next_cycle?.starts_at,
						}),
					},
				],
				balances: [
					{
						id: "balancesReset",
						visible: !carryOverBalances && !carryOverUsages,
						summary: staysAs("Balances and usage reset"),
					},
					{
						id: "carryOverBalances",
						visible: rules.carryOverBalances.visible,
						summary: carryOverSummary({
							enabled: carryOverBalances,
							featureIds: carryOverBalanceFeatureIds,
							noun: "balances",
						}),
						row: (
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
						),
					},
					{
						id: "carryOverUsages",
						visible: rules.carryOverUsages.visible,
						summary: carryOverSummary({
							enabled: carryOverUsages,
							featureIds: carryOverUsageFeatureIds,
							noun: "usage",
						}),
						row: (
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
						),
					},
				],
				stripe: [
					{
						id: "subscriptionOutcome",
						visible: !newBillingSubscription && !noBillingChanges,
						summary: stripeOutcome,
					},
					{
						id: "newBillingSubscription",
						visible: rules.newBillingSubscription.visible,
						summary: switchSummary({
							enabled: newBillingSubscription,
							changedText: "New subscription",
						}),
						row: (
							<ConfigRow
								title="New Billing Subscription"
								description="Create a separate billing cycle instead of merging with existing"
								action={
									<Switch
										checked={newBillingSubscription}
										onCheckedChange={(checked) =>
											handleBillingCycleChange({ createNewCycle: !!checked })
										}
									/>
								}
							/>
						),
					},
					{
						id: "skipBilling",
						visible: rules.skipBilling.visible,
						summary: switchSummary({
							enabled: noBillingChanges,
							changedText: "Skips Stripe",
						}),
						row: (
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
						),
					},
				],
			}}
		/>
	);
}

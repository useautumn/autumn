import { isFreeProductV2, isOneOffProductV2 } from "@autumn/shared";
import { Switch } from "@autumn/ui";
import { BillingCycleAnchorConfigRow } from "@/components/forms/shared/BillingCycleAnchorConfigRow";
import { BillingOptionSections } from "@/components/forms/shared/billing-option-sections/BillingOptionSections";
import {
	billingCycleAnchorChange,
	datedChange,
	discountsChange,
	prorationChange,
	toggledChange,
} from "@/components/forms/shared/billing-option-sections/utils/billingOptionChanges";
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
	const anchorMode = isMultiPlan ? "now" : billingCycleAnchorMode;

	return (
		<BillingOptionSections
			sections={{
				charges: [
					{
						id: "discounts",
						visible: rules.discounts.visible,
						change: discountsChange({ discounts, removedRewardIds }),
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
						change: prorationChange({ value: proration, defaultValue: "none" }),
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
						change: toggledChange({ enabled: !chargeTax, label: "no tax" }),
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
						change: toggledChange({
							enabled: customLineItems.length > 0,
							label: "custom line items",
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
						id: "planSchedule",
						visible: rules.planSchedule.visible,
						locked: resetsBillingCycleNow,
						change: toggledChange({
							enabled: isEndOfCycleSelected,
							label: "end of cycle",
						}),
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
						change: datedChange({ label: "start", date: startDate }),
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
						change: datedChange({ label: "end", date: endDate }),
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
						change: billingCycleAnchorChange({
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
				],
				balances: [
					{
						id: "carryOverBalances",
						visible: rules.carryOverBalances.visible,
						change: toggledChange({
							enabled: carryOverBalances,
							label: "carry over balances",
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
						change: toggledChange({
							enabled: carryOverUsages,
							label: "carry over usages",
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
						id: "newBillingSubscription",
						visible: rules.newBillingSubscription.visible,
						change: toggledChange({
							enabled: newBillingSubscription,
							label: "new billing subscription",
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
						change: toggledChange({
							enabled: noBillingChanges,
							label: "skip billing",
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

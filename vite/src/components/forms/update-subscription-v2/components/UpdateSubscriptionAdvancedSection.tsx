import type { BillingBehavior } from "@autumn/shared";
import { Switch } from "@autumn/ui";
import { BillingCycleAnchorConfigRow } from "@/components/forms/shared/BillingCycleAnchorConfigRow";
import { BillingOptionSections } from "@/components/forms/shared/billing-option-sections/BillingOptionSections";
import {
	billingCycleAnchorChange,
	discountsChange,
	freeTrialChange,
	prorationChange,
	toggledChange,
	versionChange,
} from "@/components/forms/shared/billing-option-sections/utils/billingOptionChanges";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import {
	DISCOUNTS_FIELDS,
	DiscountsFieldGroup,
} from "@/components/forms/shared/discount-row/DiscountsFieldGroup";
import { PlanVersionConfigRow } from "@/components/forms/shared/PlanVersionConfigRow";
import { ProrationBehaviorConfigRow } from "@/components/forms/shared/ProrationBehaviorConfigRow";
import { getBillingOptionRules } from "@/components/forms/shared/utils/billingOptionRules";
import { useCusRewardsQuery } from "@/hooks/queries/useCusRewardsQuery";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";
import { UpdateSubscriptionFreeTrialRow } from "./UpdateSubscriptionFreeTrialRow";

// The form stores the default as null, so any non-null billingBehavior is a change.
const DEFAULT_PRORATION: BillingBehavior = "prorate_immediately";

export function UpdateSubscriptionAdvancedSection() {
	const { form, formValues, formContext, trialState } =
		useUpdateSubscriptionFormContext();
	const {
		billingBehavior,
		resetBillingCycle,
		billingCycleAnchorMode,
		billingCycleAnchorDate,
		resetUsage,
		noBillingChanges,
		discounts,
		removedRewardIds,
		version,
	} = formValues;
	const { customerProduct, product, numVersions, currentVersion } = formContext;
	const { getDiscountsForSubscription } = useCusRewardsQuery();
	const appliedDiscounts = getDiscountsForSubscription({
		subscriptionIds: customerProduct.subscription_ids ?? [],
	});

	const rules = getBillingOptionRules({
		flow: "update",
		state: {
			hasActiveSubscription:
				(customerProduct.subscription_ids?.length ?? 0) > 0,
		},
	});
	const proration = billingBehavior ?? DEFAULT_PRORATION;
	const addsTrial = trialState.isCurrentlyTrialing
		? trialState.isTrialModified
		: trialState.isTrialExpanded && trialState.hasTrialValue;
	const trialChange = trialState.removeTrial
		? "end trial"
		: freeTrialChange({
				edited: addsTrial,
				enabled: true,
				length: trialState.trialLength,
				duration: trialState.trialDuration,
			});

	return (
		<BillingOptionSections
			sections={{
				plan: [
					{
						id: "version",
						visible: numVersions > 1,
						change: versionChange({ version, defaultVersion: currentVersion }),
						row: (
							<PlanVersionConfigRow
								description="Select which version of the plan to use"
								numVersions={numVersions}
								version={version ?? currentVersion ?? numVersions}
								onVersionChange={(nextVersion) =>
									form.setFieldValue("version", nextVersion)
								}
							/>
						),
					},
					{
						id: "freeTrial",
						visible: true,
						change: trialChange,
						row: <UpdateSubscriptionFreeTrialRow />,
					},
				],
				charges: [
					{
						id: "discounts",
						visible: rules.discounts.visible,
						change: discountsChange({ discounts, removedRewardIds }),
						row: (
							<DiscountsFieldGroup
								form={form}
								fields={DISCOUNTS_FIELDS}
								description="Apply percentage or fixed-amount discounts to this subscription"
								productId={product?.id}
								appliedDiscounts={appliedDiscounts}
							/>
						),
					},
					{
						id: "proration",
						visible: rules.proration.visible,
						locked: rules.proration.disabled,
						change: prorationChange({
							value: proration,
							defaultValue: DEFAULT_PRORATION,
						}),
						row: (
							<ProrationBehaviorConfigRow
								rule={rules.proration}
								value={proration}
								onChange={(value) =>
									form.setFieldValue(
										"billingBehavior",
										value === "prorate_immediately" ? null : value,
									)
								}
							/>
						),
					},
				],
				timing: [
					{
						id: "resetBillingCycle",
						visible: rules.resetBillingCycle.visible,
						locked: rules.resetBillingCycle.disabled,
						change: billingCycleAnchorChange({
							enabled: resetBillingCycle,
							mode: billingCycleAnchorMode,
							customAnchor: billingCycleAnchorDate,
						}),
						row: (
							<BillingCycleAnchorConfigRow
								enabled={resetBillingCycle}
								mode={billingCycleAnchorMode}
								customAnchor={billingCycleAnchorDate}
								onEnabledChange={(enabled) =>
									form.setFieldValue("resetBillingCycle", enabled)
								}
								onModeChange={(mode) =>
									form.setFieldValue("billingCycleAnchorMode", mode)
								}
								onCustomAnchorChange={(anchor) =>
									form.setFieldValue("billingCycleAnchorDate", anchor)
								}
							/>
						),
					},
				],
				balances: [
					{
						id: "resetUsage",
						visible: rules.resetUsage.visible,
						change: toggledChange({
							enabled: resetUsage,
							label: "reset usage",
						}),
						row: (
							<ConfigRow
								title="Reset Usage"
								description="Reset feature balances instead of carrying usage to the new plan"
								action={
									<Switch
										checked={resetUsage}
										onCheckedChange={(checked) =>
											form.setFieldValue("resetUsage", !!checked)
										}
									/>
								}
							/>
						),
					},
				],
				stripe: [
					{
						id: "skipBilling",
						visible: rules.skipBilling.visible,
						change: toggledChange({
							enabled: noBillingChanges,
							label: "no billing changes",
						}),
						row: (
							<ConfigRow
								title="No Billing Changes"
								description="Update subscription state without applying Stripe billing changes"
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

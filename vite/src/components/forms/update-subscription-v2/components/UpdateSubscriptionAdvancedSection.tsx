import type { BillingBehavior } from "@autumn/shared";
import { Switch } from "@autumn/ui";
import { BillingCycleAnchorConfigRow } from "@/components/forms/shared/BillingCycleAnchorConfigRow";
import { BillingOptionSections } from "@/components/forms/shared/billing-option-sections/BillingOptionSections";
import {
	anchorSummary,
	changedTo,
	collectionMethodSummary,
	discountsSummary,
	prorationSummary,
	renewsSummary,
	staysAs,
	switchSummary,
	trialText,
	versionSummary,
} from "@/components/forms/shared/billing-option-sections/utils/billingOptionSummaries";
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
import { CollectionMethodConfigRow } from "./CollectionMethodConfigRow";
import { UpdateSubscriptionFreeTrialRow } from "./UpdateSubscriptionFreeTrialRow";

// The form stores the default as null, so any non-null billingBehavior is a change.
const DEFAULT_PRORATION: BillingBehavior = "prorate_immediately";

export function UpdateSubscriptionAdvancedSection() {
	const {
		form,
		formValues,
		formContext,
		trialState,
		previewQuery,
		collectionMethodSwitch,
	} = useUpdateSubscriptionFormContext();
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
	const changesTrial = trialState.isCurrentlyTrialing
		? trialState.isTrialModified
		: trialState.isTrialExpanded && trialState.hasTrialValue;
	const currentTrialText = trialState.isCurrentlyTrialing
		? `Trialing, ${trialState.remainingTrialFormatted} left`
		: "No trial";
	let trialSummary = staysAs(currentTrialText);
	if (trialState.removeTrial) trialSummary = changedTo("Ends trial now");
	else if (changesTrial)
		trialSummary = changedTo(
			trialText({
				length: trialState.trialLength,
				duration: trialState.trialDuration,
			}),
		);

	return (
		<BillingOptionSections
			sections={{
				plan: [
					{
						id: "version",
						visible: numVersions > 1,
						summary: versionSummary({
							version,
							defaultVersion: currentVersion,
							defaultLabel: "current",
						}),
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
						summary: trialSummary,
						row: <UpdateSubscriptionFreeTrialRow />,
					},
				],
				charges: [
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
						summary: prorationSummary({
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
						summary: anchorSummary({
							enabled: resetBillingCycle,
							mode: billingCycleAnchorMode,
							customAnchor: billingCycleAnchorDate,
							defaultText: "Keeps cycle",
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
					{
						id: "renews",
						visible: true,
						summary: renewsSummary({
							startsAt: previewQuery.data?.next_cycle?.starts_at,
						}),
					},
				],
				balances: [
					{
						id: "resetUsage",
						visible: rules.resetUsage.visible,
						summary: switchSummary({
							enabled: resetUsage,
							changedText: "Usage resets",
							defaultText: "Usage carries over",
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
						id: "collectionMethod",
						visible: Boolean(collectionMethodSwitch.current),
						locked: collectionMethodSwitch.locked,
						summary: collectionMethodSummary({
							switchesMethod: collectionMethodSwitch.switchesMethod,
							isActive: collectionMethodSwitch.isActive,
							sendsInvoice: collectionMethodSwitch.sendsInvoice,
						}),
						row: <CollectionMethodConfigRow />,
					},
					{
						id: "skipBilling",
						visible: rules.skipBilling.visible,
						summary: switchSummary({
							enabled: noBillingChanges,
							changedText: "No billing changes",
							defaultText: collectionMethodSwitch.isActive
								? undefined
								: "Updates subscription",
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

import type { TrialOnEnd } from "@autumn/shared";
import { Switch } from "@autumn/ui";
import { BillingOptionSections } from "@/components/forms/shared/billing-option-sections/BillingOptionSections";
import {
	catalogTrialSummary,
	changedTo,
	staysAs,
	switchSummary,
	versionSummary,
} from "@/components/forms/shared/billing-option-sections/utils/billingOptionSummaries";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { FreeTrialConfigRow } from "@/components/forms/shared/FreeTrialConfigRow";
import {
	FREE_TRIAL_LENGTH_FIELDS,
	FreeTrialLengthFields,
} from "@/components/forms/shared/FreeTrialLengthFields";
import { PlanVersionConfigRow } from "@/components/forms/shared/PlanVersionConfigRow";
import { applyFreeTrialFormValues } from "@/components/forms/shared/utils/freeTrialForm";
import { toggledFreeTrialFormValues } from "@/components/forms/shared/utils/freeTrialFormValues";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { AttachCurrencyRow } from "./AttachCurrencyRow";

export function AttachPlanOptions() {
	const {
		form,
		formValues,
		numVersions,
		product,
		supportsTrialRevert,
		attachCurrency,
		additionalPlans: { isMultiPlan },
	} = useAttachFormContext();
	const {
		trialEnabled,
		trialLength,
		trialDuration,
		trialCardRequired,
		trialOnEnd,
		grantFree,
		version,
		currency,
	} = formValues;

	const handleTrialOnEndChange = supportsTrialRevert
		? (value: TrialOnEnd) => form.setFieldValue("trialOnEnd", value)
		: undefined;

	return (
		<BillingOptionSections
			sections={{
				plan: [
					{
						id: "version",
						visible: numVersions > 1 && !isMultiPlan,
						summary: versionSummary({
							version,
							defaultVersion: numVersions,
							defaultLabel: "latest",
						}),
						row: (
							<PlanVersionConfigRow
								description="Select which version of the plan to attach"
								numVersions={numVersions}
								version={version ?? product?.version ?? numVersions}
								onVersionChange={(nextVersion) => {
									form.setFieldValue("version", nextVersion);
									form.setFieldValue("items", null);
									form.setFieldValue("addLicenses", null);
									form.setFieldValue("licenseQuantities", {});
								}}
							/>
						),
					},
					{
						id: "currency",
						visible: attachCurrency.showCurrencySelector,
						summary: currency
							? changedTo(currency.toUpperCase())
							: staysAs(attachCurrency.orgDefaultCurrency.toUpperCase()),
						row: <AttachCurrencyRow />,
					},
					{
						id: "freeTrial",
						visible: true,
						summary: catalogTrialSummary({
							enabled: !!trialEnabled,
							length: trialLength,
							duration: trialDuration,
							catalogTrial: product?.free_trial,
						}),
						row: (
							<FreeTrialConfigRow
								form={form}
								lengthFields={
									<FreeTrialLengthFields
										form={form}
										fields={FREE_TRIAL_LENGTH_FIELDS}
									/>
								}
								description={
									isMultiPlan
										? "Let the customer try every selected plan before being charged"
										: undefined
								}
								expanded={!!trialEnabled}
								checked={!!trialEnabled}
								trialCardRequired={!!trialCardRequired}
								trialOnEnd={trialOnEnd}
								onTrialOnEndChange={handleTrialOnEndChange}
								onToggle={(enabled) =>
									applyFreeTrialFormValues({
										form,
										values: toggledFreeTrialFormValues({
											enabled,
											trialLength,
											catalogFreeTrial: product?.free_trial,
										}),
									})
								}
							/>
						),
					},
					{
						id: "grantFree",
						visible: true,
						summary: switchSummary({
							enabled: !!grantFree,
							changedText: "Granted free",
						}),
						row: (
							<ConfigRow
								title="Grant for Free"
								description={
									isMultiPlan
										? "Remove all prices on every selected plan for this customer"
										: "Remove all prices on this plan for this customer"
								}
								action={
									<Switch
										checked={!!grantFree}
										onCheckedChange={(enabled) =>
											form.setFieldValue("grantFree", enabled)
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

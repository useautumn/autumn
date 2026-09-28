import type { ProductV2 } from "@autumn/shared";
import {
	type CustomerStatePlan,
	type PlanLocation,
	planLocationToFieldPath,
} from "@/components/forms/customer-state/customerStateSchema";
import { PlanPrepaidQuantityFields } from "@/components/forms/shared";
import type { LicenseQuantityEditor } from "@/components/forms/shared/plan-items/LicenseQuantityControl";
import { PlanLicensesSummary } from "@/components/forms/shared/plan-items/PlanLicensesSummary";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { useCustomerStateContext } from "../CustomerStateProvider";

/** Prepaid feature and license seat quantities under a selected plan row. */
export function CustomerStatePlanQuantities({
	location,
	plan,
	product,
	readOnly = false,
}: {
	location: PlanLocation;
	plan: CustomerStatePlan;
	product: ProductV2 | undefined;
	readOnly?: boolean;
}) {
	const { form, features } = useCustomerStateContext();
	const { displayCurrency } = useCustomerDisplayCurrency();
	const path = planLocationToFieldPath(location);

	const licenseQuantityEditor: LicenseQuantityEditor = {
		quantities: plan.licenseQuantities,
		readOnly,
		onEditStart: ({ licensePlanId, quantity }) =>
			form.setFieldValue(
				`${path}.licenseQuantities.${licensePlanId}`,
				quantity,
			),
		renderField: ({ licensePlanId, min }) => (
			<form.AppField name={`${path}.licenseQuantities.${licensePlanId}`}>
				{(field) => (
					<field.QuantityField fullWidth hideFieldInfo label="" min={min} />
				)}
			</form.AppField>
		),
	};

	return (
		<>
			<PlanPrepaidQuantityFields
				items={plan.items ?? product?.items}
				quantities={plan.prepaidOptions}
				currency={displayCurrency}
				readOnly={readOnly}
				trigger="chip"
				renderField={({ featureId, step, stops }) => (
					<form.AppField name={`${path}.prepaidOptions.${featureId}`}>
						{(field) => (
							<field.QuantityField
								fullWidth
								hideFieldInfo
								label=""
								min={0}
								step={step}
								stops={stops}
							/>
						)}
					</form.AppField>
				)}
			/>
			<div className="ml-4 border-l border-border/40 pl-3 empty:hidden">
				<PlanLicensesSummary
					planId={plan.productId}
					addLicenses={plan.addLicenses}
					features={features}
					showDiff={false}
					currency={displayCurrency}
					quantityEditor={licenseQuantityEditor}
				/>
			</div>
		</>
	);
}

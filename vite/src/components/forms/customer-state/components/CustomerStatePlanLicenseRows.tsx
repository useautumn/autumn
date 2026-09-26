import type { LicenseQuantityParams } from "@autumn/shared";
import {
	type LicenseQuantityEditor,
	PlanLicensesSummary,
} from "@/components/forms/shared";
import { useCustomerStateContext } from "../CustomerStateProvider";
import type { CustomerStatePlan } from "../customerStateSchema";

type PlanPath =
	| `phases[${number}].plans[${number}]`
	| `unscheduledPlans[${number}]`;

/** Seat totals for a plan's licenses, sent as license_quantities. Same rows and
 * control as the attach sheet; a seat edit appends the license's slot first. */
export function CustomerStatePlanLicenseRows({
	plan,
	planPath,
	currency,
	readOnly,
}: {
	plan: CustomerStatePlan;
	planPath: PlanPath;
	currency?: string;
	readOnly?: boolean;
}) {
	const { form, features, showLicenseQuantities } = useCustomerStateContext();
	if (!showLicenseQuantities) return null;

	const licenseQuantities: LicenseQuantityParams[] =
		plan.licenseQuantities ?? [];
	const indexOf = (licensePlanId: string) =>
		licenseQuantities.findIndex(
			(licenseQuantity) => licenseQuantity.license_plan_id === licensePlanId,
		);

	const quantityEditor: LicenseQuantityEditor = {
		quantities: Object.fromEntries(
			licenseQuantities.map(({ license_plan_id, quantity }) => [
				license_plan_id,
				quantity,
			]),
		),
		readOnly,
		onEditStart: ({ licensePlanId, quantity }) => {
			const index = indexOf(licensePlanId);
			if (index === -1) {
				form.setFieldValue(`${planPath}.licenseQuantities`, [
					...licenseQuantities,
					{ license_plan_id: licensePlanId, quantity },
				]);
				return;
			}
			form.setFieldValue(
				`${planPath}.licenseQuantities[${index}].quantity`,
				quantity,
			);
		},
		renderField: ({ licensePlanId, min }) => {
			const index = indexOf(licensePlanId);
			if (index === -1) return null;

			return (
				<form.AppField
					name={`${planPath}.licenseQuantities[${index}].quantity`}
				>
					{(field) => (
						<field.QuantityField fullWidth hideFieldInfo label="" min={min} />
					)}
				</form.AppField>
			);
		},
	};

	return (
		<PlanLicensesSummary
			addLicenses={plan.addLicenses}
			currency={currency}
			features={features}
			planId={plan.productId}
			quantityEditor={quantityEditor}
			showDiff={false}
		/>
	);
}

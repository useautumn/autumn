import type { LicenseQuantityEditor } from "@/components/forms/shared";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import type { FormInvoicePlan } from "../createInvoiceFormSchema";
import { newInvoiceLicense } from "../createInvoiceFormSchema";

/** Licenses live in a per-plan array (one invoice can bill the same plan
 * twice), so a seat edit appends the plan's slot before binding to it. */
export function useInvoiceLicenseQuantityEditor({
	plan,
	planIndex,
}: {
	plan: FormInvoicePlan;
	planIndex: number;
}): LicenseQuantityEditor {
	const { form } = useCreateInvoiceFormContext();

	const indexOf = (licensePlanId: string) =>
		plan.licenses.findIndex(
			(license) => license.licensePlanId === licensePlanId,
		);

	return {
		quantities: Object.fromEntries(
			plan.licenses.map((license) => [license.licensePlanId, license.quantity]),
		),
		onEditStart: ({ licensePlanId, quantity }) => {
			const index = indexOf(licensePlanId);
			if (index === -1) {
				form.setFieldValue(`plans[${planIndex}].licenses`, [
					...plan.licenses,
					{ ...newInvoiceLicense(licensePlanId), quantity },
				]);
				return;
			}
			form.setFieldValue(
				`plans[${planIndex}].licenses[${index}].quantity`,
				quantity,
			);
		},
		renderField: ({ licensePlanId, min }) => {
			const index = indexOf(licensePlanId);
			if (index === -1) return null;

			return (
				<form.AppField name={`plans[${planIndex}].licenses[${index}].quantity`}>
					{(field) => (
						<field.QuantityField fullWidth hideFieldInfo label="" min={min} />
					)}
				</form.AppField>
			);
		},
	};
}

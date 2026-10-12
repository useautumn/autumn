import {
	FormLabel,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useOrgPaymentMethodTypes } from "@/components/forms/shared/hooks/useOrgPaymentMethodTypes";
import {
	ORG_PAYMENT_METHODS_HELPER,
	PaymentMethodTypesSelect,
} from "@/components/forms/shared/PaymentMethodTypesSelect";
import { useInvoiceTemplatesQuery } from "@/hooks/queries/useInvoiceTemplatesQuery";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import {
	CreateInvoiceIssueDateField,
	CreateInvoiceServicePeriodField,
} from "./CreateInvoiceDateFields";

const NO_TEMPLATE = "none";

export function CreateInvoiceSettingsFields() {
	const { form, formValues } = useCreateInvoiceFormContext();
	const { templates } = useInvoiceTemplatesQuery();
	const orgPaymentMethodTypes = useOrgPaymentMethodTypes();

	const templateOptions = [
		{ label: "No template", value: NO_TEMPLATE },
		...templates.map((template) => ({
			label: template.name,
			value: template.id,
		})),
	];
	const templateValue = formValues.invoiceTemplateId ?? NO_TEMPLATE;

	return (
		<div className="flex flex-col gap-3">
			<div>
				<FormLabel>Invoice template</FormLabel>
				<Select
					items={templateOptions}
					onValueChange={(value) =>
						form.setFieldValue(
							"invoiceTemplateId",
							value === NO_TEMPLATE ? null : value,
						)
					}
					value={templateValue}
				>
					<SelectTrigger className="w-full">
						<SelectValue>
							<span
								className={
									templateValue === NO_TEMPLATE
										? "text-tertiary-foreground"
										: undefined
								}
							>
								{templateOptions.find(
									(option) => option.value === templateValue,
								)?.label ?? "No template"}
							</span>
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{templateOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<CreateInvoiceIssueDateField />

			<div>
				<FormLabel>Payment terms</FormLabel>
				<div className="relative">
					<Input
						className="pr-12"
						min={1}
						onChange={(event) =>
							form.setFieldValue(
								"netTermsDays",
								event.target.value === "" ? null : Number(event.target.value),
							)
						}
						placeholder="Leave empty for the default"
						type="number"
						value={formValues.netTermsDays ?? ""}
					/>
					<span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-tertiary-foreground">
						days
					</span>
				</div>
			</div>

			<PaymentMethodTypesSelect
				value={formValues.paymentMethodTypes ?? orgPaymentMethodTypes}
				onValueChange={(paymentMethodTypes) =>
					form.setFieldValue("paymentMethodTypes", paymentMethodTypes)
				}
				description={ORG_PAYMENT_METHODS_HELPER}
			/>

			<CreateInvoiceServicePeriodField />

			<div>
				<FormLabel>Tax rate ID</FormLabel>
				<Input
					onChange={(event) =>
						form.setFieldValue("taxRateId", event.target.value || null)
					}
					placeholder="txr_... applied to every line"
					value={formValues.taxRateId ?? ""}
				/>
			</div>
		</div>
	);
}

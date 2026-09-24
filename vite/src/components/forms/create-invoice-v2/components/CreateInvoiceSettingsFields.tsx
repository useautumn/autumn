import {
	FormLabel,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useInvoiceTemplatesQuery } from "@/hooks/queries/useInvoiceTemplatesQuery";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import { CreateInvoicePeriodField } from "./CreateInvoicePeriodField";

const NO_TEMPLATE = "none";

export function CreateInvoiceSettingsFields() {
	const { form, formValues } = useCreateInvoiceFormContext();
	const { templates } = useInvoiceTemplatesQuery();

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

			<div>
				<FormLabel>Payment terms</FormLabel>
				<Input
					min={1}
					onChange={(event) =>
						form.setFieldValue(
							"netTermsDays",
							event.target.value === "" ? null : Number(event.target.value),
						)
					}
					placeholder="Days until due, or leave empty for the default"
					type="number"
					value={formValues.netTermsDays ?? ""}
				/>
			</div>

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

			<CreateInvoicePeriodField />
		</div>
	);
}

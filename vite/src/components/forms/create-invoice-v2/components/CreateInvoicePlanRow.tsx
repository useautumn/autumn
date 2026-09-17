import { IconButton } from "@autumn/ui";
import { XIcon } from "@phosphor-icons/react";
import { SelectedPlanRow } from "@/components/forms/shared";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import type { FormInvoicePlan } from "../createInvoiceFormSchema";
import { CreateInvoiceQuantityFields } from "./CreateInvoiceQuantityFields";

export function CreateInvoicePlanRow({ plan }: { plan: FormInvoicePlan }) {
	const { form, formValues, products, productsById, planEditor } =
		useCreateInvoiceFormContext();
	const planIndex = formValues.plans.findIndex(
		(candidate) => candidate._id === plan._id,
	);
	const selectedProduct = productsById.get(plan.planId);

	const canRemove = formValues.plans.length > 1;

	const handleRemove = () => {
		form.setFieldValue(
			"plans",
			formValues.plans.filter((candidate) => candidate._id !== plan._id),
		);
	};

	if (!plan.planId) {
		return (
			<div className="flex items-center gap-2">
				<form.AppField name={`plans[${planIndex}].planId`}>
					{(field) => (
						<field.SelectField
							className="flex-1 min-w-0"
							emptyText="No plans found"
							hideFieldInfo
							label=""
							options={products
								.filter((product) => !product.archived)
								.map((product) => ({
									label: product.name ?? product.id,
									value: product.id,
								}))}
							placeholder="Select a plan"
							searchPlaceholder="Search plans..."
							searchable
						/>
					)}
				</form.AppField>
				{canRemove && (
					<IconButton
						className="shrink-0 text-tertiary-foreground hover:text-red-500"
						icon={<XIcon size={12} />}
						onClick={handleRemove}
						size="sm"
						variant="muted"
					/>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-1.5">
			<SelectedPlanRow
				productId={plan.planId}
				product={selectedProduct}
				customItems={plan.items}
				isCustom={plan.isCustom}
				onEdit={() => planEditor.handleEditPlan({ planId: plan._id })}
				onRemove={canRemove ? handleRemove : undefined}
			/>
			<CreateInvoiceQuantityFields
				items={plan.items ?? selectedProduct?.items}
				planIndex={planIndex}
				quantities={plan.featureQuantities}
			/>
		</div>
	);
}

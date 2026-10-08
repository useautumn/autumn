import { usePlanScopeField } from "@/components/forms/shared";
import { buildMoveToAction } from "@/components/forms/shared/PlanRowActionsMenu";
import { PlanPicker } from "@/components/forms/shared/plan-tray/PlanPicker";
import { PlanTraySelectedRow } from "@/components/forms/shared/plan-tray/PlanTraySelectedRow";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import { invoicePlanItems } from "../utils/clearInvoiceIncludedUsage";
import { CreateInvoiceCopyExistingPlans } from "./CreateInvoiceCopyExistingPlans";
import { CreateInvoiceLicenseRows } from "./CreateInvoiceLicenseRows";
import { CreateInvoiceQuantityFields } from "./CreateInvoiceQuantityFields";

/** One tray row: the plan picker until a plan is chosen, then the plan with its quantities. */
export function CreateInvoicePlanRow({ planIndex }: { planIndex: number }) {
	const { formValues, products, productsById, planEditor, planHandlers } =
		useCreateInvoiceFormContext();
	const plan = formValues.plans[planIndex];
	const setScope = (entityId: string | null) =>
		planHandlers.handleSelectPlanScope({ planIndex, entityId });
	const { hasEntities, selectedLabel, scopeMenu } = usePlanScopeField({
		planEntityId: plan?.entityId,
		onChange: (entityId) => setScope(entityId ?? null),
	});

	if (!plan) return null;
	const removePlan = () => planHandlers.handleRemovePlan({ planId: plan._id });

	if (!plan.planId) {
		return (
			<div className="min-w-0">
				<PlanPicker
					products={products.filter((product) => !product.archived)}
					scope={{ value: plan.entityId, onChange: setScope }}
					header={
						<CreateInvoiceCopyExistingPlans
							planIndex={planIndex}
							scopeLabel={hasEntities ? selectedLabel : undefined}
						/>
					}
					defaultOpen={planHandlers.shouldOpenPickerImmediately()}
					onSelect={(planId) =>
						planHandlers.handleSelectPlan({ planIndex, planId })
					}
					onDismiss={removePlan}
				/>
			</div>
		);
	}

	const product = productsById.get(plan.planId);

	return (
		<PlanTraySelectedRow
			productId={plan.planId}
			product={product}
			items={plan.items}
			isCustom={plan.isCustom}
			actions={hasEntities ? [buildMoveToAction({ scopeMenu })] : []}
			onCustomize={() => planEditor.handleEditPlan({ planId: plan._id })}
			onRemove={removePlan}
		>
			<CreateInvoiceQuantityFields
				items={invoicePlanItems({
					planItems: plan.items,
					catalogItems: product?.items,
				})}
				planIndex={planIndex}
				quantities={plan.featureQuantities}
			/>
			<CreateInvoiceLicenseRows plan={plan} planIndex={planIndex} />
		</PlanTraySelectedRow>
	);
}

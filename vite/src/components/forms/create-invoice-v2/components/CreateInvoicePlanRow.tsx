import { CalendarBlankIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { usePlanScopeField } from "@/components/forms/shared";
import {
	buildMoveToAction,
	type PlanRowAction,
	ROW_ACTION_ICON_SIZE,
} from "@/components/forms/shared/PlanRowActionsMenu";
import { PlanPicker } from "@/components/forms/shared/plan-tray/PlanPicker";
import { PlanTraySelectedRow } from "@/components/forms/shared/plan-tray/PlanTraySelectedRow";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import { invoicePlanItems } from "../utils/clearInvoiceIncludedUsage";
import { CreateInvoiceCopyExistingPlans } from "./CreateInvoiceCopyExistingPlans";
import { CreateInvoiceLicenseRows } from "./CreateInvoiceLicenseRows";
import { CreateInvoiceQuantityFields } from "./CreateInvoiceQuantityFields";
import { PlanServicePeriodChip } from "./PlanServicePeriodChip";

/** One tray row: the plan picker until a plan is chosen, then the plan with its quantities. */
export function CreateInvoicePlanRow({ planIndex }: { planIndex: number }) {
	const {
		formValues,
		products,
		productsById,
		planEditor,
		planHandlers,
		planIdsOutsidePeriod,
	} = useCreateInvoiceFormContext();
	const [isPeriodOpen, setIsPeriodOpen] = useState(false);
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
	const isOutsidePeriod = planIdsOutsidePeriod.has(plan._id);
	const actions: PlanRowAction[] = [
		{
			label: "Set service period",
			icon: <CalendarBlankIcon size={ROW_ACTION_ICON_SIZE} />,
			onSelect: () => setIsPeriodOpen(true),
		},
		...(hasEntities ? [buildMoveToAction({ scopeMenu })] : []),
	];

	return (
		<PlanTraySelectedRow
			productId={plan.planId}
			product={product}
			items={plan.items}
			isCustom={plan.isCustom}
			badge={
				<PlanServicePeriodChip
					period={plan.period}
					isInvalid={isOutsidePeriod}
					open={isPeriodOpen}
					onOpenChange={setIsPeriodOpen}
					onApply={(period) =>
						planHandlers.handleSetPlanPeriod({ planIndex, period })
					}
				/>
			}
			actions={actions}
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
			{isOutsidePeriod && (
				<p className="pl-1 text-xs text-red-500">
					This period falls outside the invoice's service period. Change one of
					them to create the invoice.
				</p>
			)}
		</PlanTraySelectedRow>
	);
}

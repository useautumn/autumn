import type { FrontendProduct, ProductV2 } from "@autumn/shared";
import { FreeTrialDuration, productV2ToFrontendProduct } from "@autumn/shared";
import { useCallback, useMemo, useState } from "react";
import {
	getProductWithSupportedPlanFormValues,
	getSupportedPlanFormPatchFromDraftProduct,
} from "@/components/forms/shared/utils/planCustomizationUtils";
import type { CreateInvoiceForm } from "../createInvoiceFormSchema";
import { applyInvoicePlanEditorItems } from "../utils/applyInvoicePlanEditorItems";
import { clearInvoiceIncludedUsage } from "../utils/clearInvoiceIncludedUsage";
import type { CreateInvoiceFormApi } from "./useCreateInvoiceForm";

/** A standalone invoice never grants a trial, so the plan's own trial is left alone. */
const NO_TRIAL_EDITS = {
	trialLength: null,
	trialDuration: FreeTrialDuration.Day,
	trialEnabled: false,
	trialCardRequired: false,
} as const;

/** Only items and version are carried back; trials and licenses are out of scope. */
export function useCreateInvoicePlanEditor({
	form,
	formValues,
	productsById,
	onOpen,
	onClose,
}: {
	form: CreateInvoiceFormApi;
	formValues: CreateInvoiceForm;
	productsById: Map<string, ProductV2>;
	onOpen?: () => void;
	onClose?: () => void;
}) {
	const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

	const editingPlan = useMemo(
		() => formValues.plans.find((plan) => plan._id === editingPlanId),
		[formValues.plans, editingPlanId],
	);

	const planEditorProduct = useMemo(() => {
		const product = editingPlan && productsById.get(editingPlan.planId);
		if (!editingPlan || !product) return undefined;

		const editable = getProductWithSupportedPlanFormValues({
			baseProduct: productV2ToFrontendProduct({ product }),
			formValues: {
				items: editingPlan.items,
				version: editingPlan.version,
				...NO_TRIAL_EDITS,
			},
		});
		return {
			...editable,
			items: clearInvoiceIncludedUsage({ items: editable.items }),
		};
	}, [editingPlan, productsById]);

	const handleCancel = useCallback(() => {
		setEditingPlanId(null);
		onClose?.();
	}, [onClose]);

	const handleEditPlan = useCallback(
		({ planId }: { planId: string }) => {
			const plan = formValues.plans.find(
				(candidate) => candidate._id === planId,
			);
			if (!plan || !productsById.has(plan.planId)) return;

			setEditingPlanId(planId);
			onOpen?.();
		},
		[formValues.plans, productsById, onOpen],
	);

	const handleSave = useCallback(
		(draftProduct: FrontendProduct) => {
			if (!(planEditorProduct && editingPlanId)) return handleCancel();

			const patch = getSupportedPlanFormPatchFromDraftProduct({
				baseProduct: planEditorProduct,
				draftProduct,
			});
			const index = form.store.state.values.plans.findIndex(
				({ _id }) => _id === editingPlanId,
			);
			const plan = form.store.state.values.plans[index];
			if (plan) {
				const edited =
					patch.items == null
						? plan
						: applyInvoicePlanEditorItems({
								plan,
								previousItems: planEditorProduct.items,
								items: patch.items,
							});
				form.setFieldValue(`plans[${index}]`, {
					...edited,
					...("version" in patch && { version: patch.version }),
				});
			}
			handleCancel();
		},
		[editingPlanId, form, handleCancel, planEditorProduct],
	);

	return useMemo(
		() => ({
			planEditorProduct,
			showPlanEditor: editingPlanId !== null,
			handleEditPlan,
			handlePlanEditorSave: handleSave,
			handlePlanEditorCancel: handleCancel,
		}),
		[
			planEditorProduct,
			editingPlanId,
			handleEditPlan,
			handleSave,
			handleCancel,
		],
	);
}

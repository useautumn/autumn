import {
	type CustomizePlanLicense,
	type FrontendProduct,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { useEffect, useMemo } from "react";
import { getSupportedPlanFormPatchFromDraftProduct } from "@/components/forms/shared/utils/planCustomizationUtils";
import { InlinePlanEditor } from "@/components/v2/inline-custom-plan-editor/InlinePlanEditor";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { useCustomerStateContext } from "../CustomerStateProvider";

/** Opens the plan being edited in the inline editor and saves it back as items. */
export function CustomerStatePlanEditor() {
	const {
		products,
		editingPlan,
		editingPlanValue,
		handlePlanEditSave,
		setEditingPlan,
	} = useCustomerStateContext();
	const { setIsInlineEditorOpen } = useCustomerContext();

	useEffect(() => {
		setIsInlineEditorOpen(!!editingPlan);
		return () => setIsInlineEditorOpen(false);
	}, [editingPlan, setIsInlineEditorOpen]);

	const planEditorProduct = useMemo(() => {
		const product = products.find((p) => p.id === editingPlanValue?.productId);
		if (!(editingPlanValue && product)) return undefined;
		return productV2ToFrontendProduct({
			product: {
				...product,
				items: editingPlanValue.items ?? product.items,
				version: editingPlanValue.version ?? product.version,
			},
		});
	}, [editingPlanValue, products]);

	const handleSave = (
		draftProduct: FrontendProduct,
		addLicenses?: CustomizePlanLicense[],
	) => {
		if (!(editingPlanValue && planEditorProduct)) return setEditingPlan(null);

		const patch = getSupportedPlanFormPatchFromDraftProduct({
			baseProduct: planEditorProduct,
			draftProduct,
		});
		handlePlanEditSave({
			plan: {
				...editingPlanValue,
				...(patch.items !== undefined && {
					items: patch.items,
					isCustom: true,
				}),
				...("version" in patch && { version: patch.version }),
				...(addLicenses !== undefined && { addLicenses }),
			},
		});
	};

	if (!planEditorProduct) return null;

	return (
		<InlinePlanEditor
			product={planEditorProduct}
			onSave={handleSave}
			onCancel={() => setEditingPlan(null)}
			isOpen={!!editingPlan}
			enableLicenseEditing
			initialAddLicenses={editingPlanValue?.addLicenses}
		/>
	);
}

import type {
	CustomizePlanLicense,
	FrontendProduct,
	ProductV2,
} from "@autumn/shared";
import { productV2ToFrontendProduct } from "@autumn/shared";
import { useCallback, useMemo, useState } from "react";
import { applyDefinedFormPatchFields } from "@/components/forms/shared/utils/formPatchUtils";
import {
	getProductWithSupportedPlanFormValues,
	getSupportedPlanFormPatchFromDraftProduct,
} from "@/components/forms/shared/utils/planCustomizationUtils";
import { clampLicenseQuantitiesToIncluded } from "@/utils/billing/licenseQuantityUtils";
import type { AttachForm } from "../attachFormSchema";
import type { UseAttachForm } from "./useAttachForm";

type AttachEditablePatchFields = Pick<
	AttachForm,
	| "items"
	| "version"
	| "trialEnabled"
	| "trialLength"
	| "trialDuration"
	| "trialCardRequired"
>;

const PLAN_EDITABLE_PATCH_FIELDS = ["items", "version"] as const;
const TRIAL_EDITABLE_PATCH_FIELDS = [
	"trialEnabled",
	"trialLength",
	"trialDuration",
	"trialCardRequired",
] as const;

export function useAttachPlanEditor({
	form,
	formValues,
	products,
	productWithFormItems,
	onOpen,
	onClose,
}: {
	form: UseAttachForm;
	formValues: AttachForm;
	products: ProductV2[];
	productWithFormItems: FrontendProduct | undefined;
	onOpen?: () => void;
	onClose?: () => void;
}) {
	const {
		additionalPlans,
		grantFree,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
	} = formValues;
	const [editingPlanId, setEditingPlanId] = useState<string | null>();
	const planEditorProduct = useMemo(() => {
		if (typeof editingPlanId !== "string") return productWithFormItems;

		const plan = additionalPlans.find(({ _id }) => _id === editingPlanId);
		const product = products.find(({ id }) => id === plan?.productId);
		if (!plan || !product) return undefined;

		return getProductWithSupportedPlanFormValues({
			baseProduct: productV2ToFrontendProduct({ product }),
			formValues: {
				items: plan.items,
				version: plan.version,
				trialLength,
				trialDuration,
				trialEnabled,
				trialCardRequired,
			},
		});
	}, [
		editingPlanId,
		productWithFormItems,
		additionalPlans,
		products,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
	]);

	const handleCancel = useCallback(() => {
		setEditingPlanId(undefined);
		onClose?.();
	}, [onClose]);

	const handleEdit = useCallback(
		({ additionalPlanId }: { additionalPlanId?: string } = {}) => {
			const canEdit = additionalPlanId
				? additionalPlans.some(
						(plan) =>
							plan._id === additionalPlanId &&
							products.some(({ id }) => id === plan.productId),
					)
				: !!productWithFormItems;
			if (!canEdit || grantFree) return;

			setEditingPlanId(additionalPlanId ?? null);
			onOpen?.();
		},
		[additionalPlans, products, productWithFormItems, grantFree, onOpen],
	);

	const handleSave = useCallback(
		(
			draftProduct: FrontendProduct,
			editedAddLicenses?: CustomizePlanLicense[],
		) => {
			if (!planEditorProduct) return handleCancel();

			const patch = getSupportedPlanFormPatchFromDraftProduct({
				baseProduct: planEditorProduct,
				draftProduct,
			});
			const attachPatch = {
				items: patch.items,
				version: patch.version,
				trialEnabled: patch.trialEnabled,
				trialLength: patch.trialLength,
				trialDuration: patch.trialDuration,
				trialCardRequired: patch.trialCardRequired,
			} satisfies Partial<AttachEditablePatchFields>;
			const applyPatch = (
				fields: ReadonlyArray<keyof AttachEditablePatchFields>,
			) =>
				applyDefinedFormPatchFields({
					patch: attachPatch,
					fields,
					setFieldValue: ({ field, value }) => {
						form.setFieldValue(field, value);
					},
				});

			applyPatch(TRIAL_EDITABLE_PATCH_FIELDS);

			if (typeof editingPlanId === "string") {
				const index = form.store.state.values.additionalPlans.findIndex(
					({ _id }) => _id === editingPlanId,
				);
				const plan = form.store.state.values.additionalPlans[index];
				if (plan) {
					form.setFieldValue(`additionalPlans[${index}]`, {
						...plan,
						...(patch.items !== undefined && {
							items: patch.items,
							isCustom: true,
						}),
						...("version" in patch && { version: patch.version }),
					});
				}
				handleCancel();
				return;
			}

			applyPatch(PLAN_EDITABLE_PATCH_FIELDS);
			if (editedAddLicenses) {
				form.setFieldValue("addLicenses", editedAddLicenses);
				form.setFieldValue(
					"licenseQuantities",
					clampLicenseQuantitiesToIncluded({
						licenseQuantities: form.store.state.values.licenseQuantities,
						upsertLicenses: editedAddLicenses,
					}),
				);
			}
			handleCancel();
		},
		[editingPlanId, form, handleCancel, planEditorProduct],
	);

	return {
		planEditorProduct,
		showPlanEditor: editingPlanId !== undefined,
		handleEditPlan: handleEdit,
		handlePlanEditorSave: handleSave,
		handlePlanEditorCancel: handleCancel,
	};
}

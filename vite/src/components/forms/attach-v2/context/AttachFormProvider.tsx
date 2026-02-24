import type {
	Feature,
	FrontendProduct,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { productV2ToFrontendProduct, UsageModel } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { applyDefinedFormPatchFields } from "@/components/forms/shared/utils/formPatchUtils";
import {
	getProductWithSupportedPlanFormValues,
	getSupportedPlanFormPatchFromDraftProduct,
} from "@/components/forms/shared/utils/planCustomizationUtils";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductVersionQuery } from "@/hooks/queries/useProductVersionQuery";
import type { PrepaidItemWithFeature } from "@/hooks/stores/useProductStore";
import { usePrepaidItems } from "@/hooks/stores/useProductStore";
import type { AttachForm } from "../attachFormSchema";
import { type UseAttachForm, useAttachForm } from "../hooks/useAttachForm";
import { useAttachMutation } from "../hooks/useAttachMutation";
import {
	type UseAttachPreviewReturn,
	useAttachPreview,
} from "../hooks/useAttachPreview";
import { useAttachRequestBody } from "../hooks/useAttachRequestBody";

interface AttachFormContextValue {
	form: UseAttachForm;
	formValues: AttachForm;
	features: Feature[];

	product: ProductV2 | undefined;
	prepaidItems: PrepaidItemWithFeature[];
	originalItems: ProductItem[] | undefined;
	productWithFormItems: FrontendProduct | undefined;
	hasCustomizations: boolean;
	numVersions: number;
	initialPrepaidOptions: Record<string, number>;

	previewQuery: UseAttachPreviewReturn;

	showPlanEditor: boolean;
	handleEditPlan: () => void;
	handlePlanEditorSave: (product: FrontendProduct) => void;
	handlePlanEditorCancel: () => void;

	isPending: boolean;
	handleConfirm: () => void;
	handleInvoiceAttach: (params: { enableProductImmediately: boolean }) => void;
}

const AttachFormReactContext = createContext<AttachFormContextValue | null>(
	null,
);

interface AttachFormProviderProps {
	customerId: string | undefined;
	entityId: string | undefined;
	initialProductId?: string;
	onPlanEditorOpen?: () => void;
	onPlanEditorClose?: () => void;
	onInvoiceCreated?: (invoiceId: string) => void;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
	children: ReactNode;
}

type AttachEditablePatchFields = Pick<
	AttachForm,
	| "items"
	| "version"
	| "trialEnabled"
	| "trialLength"
	| "trialDuration"
	| "trialCardRequired"
>;

const ATTACH_EDITABLE_PATCH_FIELDS = [
	"items",
	"version",
	"trialEnabled",
	"trialLength",
	"trialDuration",
	"trialCardRequired",
] as const satisfies ReadonlyArray<keyof AttachEditablePatchFields>;

export function AttachFormProvider({
	customerId,
	entityId,
	initialProductId,
	onPlanEditorOpen,
	onPlanEditorClose,
	onInvoiceCreated,
	onCheckoutRedirect,
	onSuccess,
	children,
}: AttachFormProviderProps) {
	const [showPlanEditor, setShowPlanEditor] = useState(false);
	const [initialPrepaidOptions, setInitialPrepaidOptions] = useState<
		Record<string, number>
	>({});

	const form = useAttachForm({ initialProductId });

	const { features } = useFeaturesQuery();
	const { products } = useProductsQuery();

	const formValues = useStore(form.store, (state) => state.values);
	const {
		productId,
		prepaidOptions,
		items,
		version,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
		planSchedule,
		billingBehavior,
		newBillingSubscription,
		discounts,
	} = formValues;

	const product = useMemo(
		() => products.find((p) => p.id === productId && !p.archived),
		[products, productId],
	);

	const productVersionQuery = useProductVersionQuery({
		productId: product?.id,
	});
	const numVersions =
		productVersionQuery.data?.numVersions ?? product?.version ?? 1;

	const { prepaidItems } = usePrepaidItems({ product });

	// Track product changes and initialize prepaid options
	const previousProductIdRef = useRef<string | undefined>();
	useEffect(() => {
		// Only trigger when productId actually changes (not on initial mount with same value)
		if (previousProductIdRef.current === productId) {
			return;
		}

		const isProductChange =
			previousProductIdRef.current !== undefined &&
			previousProductIdRef.current !== productId;

		previousProductIdRef.current = productId;

		if (isProductChange) {
			// Reset items and version when product changes
			form.setFieldValue("items", null);
			form.setFieldValue("version", undefined);
		}

		// Initialize prepaid options for the selected product
		if (product) {
			const newInitialPrepaidOptions: Record<string, number> = {};
			for (const item of product.items) {
				if (item.usage_model === UsageModel.Prepaid && item.feature_id) {
					newInitialPrepaidOptions[item.feature_id] = 0;
				}
			}
			form.setFieldValue("prepaidOptions", newInitialPrepaidOptions);
			setInitialPrepaidOptions(newInitialPrepaidOptions);
		}
	}, [productId, product, form]);

	const originalItems = product?.items as ProductItem[] | undefined;

	const hasCustomizations = items !== null && items.length > 0;

	const productWithFormItems = useMemo((): FrontendProduct | undefined => {
		if (!product) return undefined;

		const baseFrontendProduct = productV2ToFrontendProduct({
			product: product as ProductV2,
		});

		return getProductWithSupportedPlanFormValues({
			baseProduct: baseFrontendProduct,
			formValues: {
				items,
				version,
				trialLength,
				trialDuration,
				trialEnabled,
				trialCardRequired,
			},
		});
	}, [
		product,
		items,
		version,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
	]);

	const { requestBody, buildRequestBody } = useAttachRequestBody({
		customerId,
		entityId,
		product,
		prepaidOptions,
		items,
		version,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
		planSchedule,
		billingBehavior,
		newBillingSubscription,
		discounts,
	});

	const previewQuery = useAttachPreview({ requestBody });

	const { handleConfirm, handleInvoiceAttach, isPending } = useAttachMutation({
		customerId,
		buildRequestBody,
		onInvoiceCreated,
		onCheckoutRedirect,
		onSuccess,
	});

	const handleEditPlan = useCallback(() => {
		if (!productWithFormItems) return;
		setShowPlanEditor(true);
		onPlanEditorOpen?.();
	}, [productWithFormItems, onPlanEditorOpen]);

	const handlePlanEditorSave = useCallback(
		(draftProduct: FrontendProduct) => {
			if (!productWithFormItems) {
				setShowPlanEditor(false);
				onPlanEditorClose?.();
				return;
			}

			const patch = getSupportedPlanFormPatchFromDraftProduct({
				baseProduct: productWithFormItems,
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

			applyDefinedFormPatchFields<
				AttachEditablePatchFields,
				keyof AttachEditablePatchFields
			>({
				patch: attachPatch,
				fields: ATTACH_EDITABLE_PATCH_FIELDS,
				setFieldValue: ({ field, value }) => {
					form.setFieldValue(field, value);
				},
			});

			const currentPrepaidOptions = form.store.state.values.prepaidOptions;
			const updatedPrepaidOptions = { ...currentPrepaidOptions };
			let hasNewPrepaidItems = false;

			for (const item of draftProduct.items) {
				if (
					item.usage_model === "prepaid" &&
					item.feature_id &&
					updatedPrepaidOptions[item.feature_id] === undefined
				) {
					updatedPrepaidOptions[item.feature_id] = 0;
					hasNewPrepaidItems = true;
				}
			}

			if (hasNewPrepaidItems) {
				form.setFieldValue("prepaidOptions", updatedPrepaidOptions);
			}

			setShowPlanEditor(false);
			onPlanEditorClose?.();
		},
		[form, onPlanEditorClose, productWithFormItems],
	);

	const handlePlanEditorCancel = useCallback(() => {
		setShowPlanEditor(false);
		onPlanEditorClose?.();
	}, [onPlanEditorClose]);

	const value = useMemo<AttachFormContextValue>(
		() => ({
			form,
			formValues,
			features,
			product,
			prepaidItems,
			originalItems,
			productWithFormItems,
			hasCustomizations,
			numVersions,
			initialPrepaidOptions,
			previewQuery,
			showPlanEditor,
			handleEditPlan,
			handlePlanEditorSave,
			handlePlanEditorCancel,
			isPending,
			handleConfirm,
			handleInvoiceAttach,
		}),
		[
			form,
			formValues,
			features,
			product,
			prepaidItems,
			originalItems,
			productWithFormItems,
			hasCustomizations,
			numVersions,
			initialPrepaidOptions,
			previewQuery,
			showPlanEditor,
			handleEditPlan,
			handlePlanEditorSave,
			handlePlanEditorCancel,
			isPending,
			handleConfirm,
			handleInvoiceAttach,
		],
	);

	return (
		<AttachFormReactContext.Provider value={value}>
			{children}
		</AttachFormReactContext.Provider>
	);
}

export function useAttachFormContext(): AttachFormContextValue {
	const context = useContext(AttachFormReactContext);
	if (!context) {
		throw new Error(
			"useAttachFormContext must be used within AttachFormProvider",
		);
	}
	return context;
}

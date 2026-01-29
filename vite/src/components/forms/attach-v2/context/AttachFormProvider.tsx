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
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
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

export interface AttachFormContext {
	customerId: string | undefined;
	entityId: string | undefined;
}

interface AttachFormContextValue {
	formContext: AttachFormContext;
	form: UseAttachForm;
	formValues: AttachForm;
	features: Feature[];

	product: ProductV2 | undefined;
	prepaidItems: PrepaidItemWithFeature[];
	originalItems: ProductItem[] | undefined;
	productWithFormItems: FrontendProduct | undefined;
	hasCustomizations: boolean;

	previewQuery: UseAttachPreviewReturn;

	showPlanEditor: boolean;
	handleEditPlan: () => void;
	handlePlanEditorSave: (items: ProductItem[]) => void;
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

	const form = useAttachForm({ initialProductId });

	const { features } = useFeaturesQuery();
	const { products } = useProductsQuery();

	const formValues = useStore(form.store, (state) => state.values);
	const { productId, prepaidOptions, items, version } = formValues;

	const product = useMemo(
		() => products.find((p) => p.id === productId && !p.archived),
		[products, productId],
	);

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
			const initialPrepaidOptions: Record<string, number> = {};
			for (const item of product.items) {
				if (item.usage_model === UsageModel.Prepaid && item.feature_id) {
					initialPrepaidOptions[item.feature_id] = 0;
				}
			}
			form.setFieldValue("prepaidOptions", initialPrepaidOptions);
		}
	}, [productId, product, form]);

	const originalItems = product?.items as ProductItem[] | undefined;

	const hasCustomizations = items !== null && items.length > 0;

	const productWithFormItems = useMemo((): FrontendProduct | undefined => {
		if (!product) return undefined;

		const baseFrontendProduct = productV2ToFrontendProduct({
			product: product as ProductV2,
		});

		if (items) {
			return {
				...baseFrontendProduct,
				items,
			};
		}

		return baseFrontendProduct;
	}, [product, items]);

	const previewQuery = useAttachPreview({
		customerId,
		entityId,
		product,
		prepaidOptions,
		items,
		version,
	});

	const { buildRequestBody } = useAttachRequestBody({
		customerId,
		entityId,
		product,
		prepaidOptions,
		items,
		version,
	});

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
		(newItems: ProductItem[]) => {
			form.setFieldValue("items", newItems);

			const currentPrepaidOptions = form.store.state.values.prepaidOptions;
			const updatedPrepaidOptions = { ...currentPrepaidOptions };
			let hasNewPrepaidItems = false;

			for (const item of newItems) {
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
		[form, onPlanEditorClose],
	);

	const handlePlanEditorCancel = useCallback(() => {
		setShowPlanEditor(false);
		onPlanEditorClose?.();
	}, [onPlanEditorClose]);

	const formContext = useMemo(
		(): AttachFormContext => ({
			customerId,
			entityId,
		}),
		[customerId, entityId],
	);

	const value = useMemo<AttachFormContextValue>(
		() => ({
			formContext,
			form,
			formValues,
			features,
			product,
			prepaidItems,
			originalItems,
			productWithFormItems,
			hasCustomizations,
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
			formContext,
			form,
			formValues,
			features,
			product,
			prepaidItems,
			originalItems,
			productWithFormItems,
			hasCustomizations,
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

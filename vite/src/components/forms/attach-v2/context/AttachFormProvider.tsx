import type {
	Feature,
	FrontendProduct,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import {
	FreeTrialDuration,
	productV2ToFrontendProduct,
	UsageModel,
} from "@autumn/shared";
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
import { useGrantFree } from "../hooks/useGrantFree";

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

	handleGrantFreeToggle: (params: { enabled: boolean }) => void;

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
		prorationBehavior,
		redirectMode,
		newBillingSubscription,
		discounts,
		grantFree,
		noBillingChanges,
		carryOverBalances,
		carryOverBalanceFeatureIds,
		carryOverUsages,
		carryOverUsageFeatureIds,
		customLineItems,
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

	// Fetch the target version's product data when version differs from latest
	const isVersionChanged =
		version !== undefined && version !== (product?.version ?? numVersions);
	const versionProductQuery = useProductVersionQuery({
		productId: product?.id,
		version,
		enabled: isVersionChanged,
	});

	const effectiveProduct = useMemo((): ProductV2 | undefined => {
		if (isVersionChanged && versionProductQuery.data) {
			return versionProductQuery.data.product;
		}
		return product;
	}, [product, isVersionChanged, versionProductQuery.data]);

	const { prepaidItems } = usePrepaidItems({ product: effectiveProduct });

	const resolveCurrentItems = useCallback(
		() => items ?? (effectiveProduct?.items as ProductItem[]) ?? [],
		[items, effectiveProduct?.items],
	);

	const { handleGrantFreeToggle, resetGrantFree } = useGrantFree({
		form,
		resolveCurrentItems,
	});

	// Reset items when version changes so new version's items display
	const previousVersionRef = useRef<number | undefined>(version);
	useEffect(() => {
		if (previousVersionRef.current === version) return;
		previousVersionRef.current = version;
		form.setFieldValue("items", null);
	}, [version, form]);

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
			form.setFieldValue("items", null);
			form.setFieldValue("version", undefined);
			form.setFieldValue("trialEnabled", false);
			form.setFieldValue("trialLength", null);
			form.setFieldValue("trialDuration", FreeTrialDuration.Day);
			form.setFieldValue("trialCardRequired", true);
			form.setFieldValue("grantFree", false);
			resetGrantFree();
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

			if (product.free_trial) {
				form.setFieldValue("trialEnabled", true);
				form.setFieldValue("trialLength", Number(product.free_trial.length));
				form.setFieldValue(
					"trialDuration",
					product.free_trial.duration as FreeTrialDuration,
				);
				form.setFieldValue(
					"trialCardRequired",
					Boolean(product.free_trial.card_required),
				);
			}
		}
	}, [productId, product, form, resetGrantFree]);

	const originalItems = effectiveProduct?.items as ProductItem[] | undefined;

	const hasCustomizations = items !== null && items.length > 0;

	const productWithFormItems = useMemo((): FrontendProduct | undefined => {
		if (!effectiveProduct) return undefined;

		const baseFrontendProduct = productV2ToFrontendProduct({
			product: effectiveProduct as ProductV2,
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
		effectiveProduct,
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
		product: effectiveProduct,
		prepaidOptions,
		items,
		version,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
		planSchedule,
		prorationBehavior,
		redirectMode,
		newBillingSubscription,
		discounts,
		noBillingChanges,
		carryOverBalances,
		carryOverBalanceFeatureIds,
		carryOverUsages,
		carryOverUsageFeatureIds,
		customLineItems,
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
		if (!productWithFormItems || grantFree) return;
		setShowPlanEditor(true);
		onPlanEditorOpen?.();
	}, [productWithFormItems, onPlanEditorOpen, grantFree]);

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
			product: effectiveProduct,
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
			handleGrantFreeToggle,
			isPending,
			handleConfirm,
			handleInvoiceAttach,
		}),
		[
			form,
			formValues,
			features,
			effectiveProduct,
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
			handleGrantFreeToggle,
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

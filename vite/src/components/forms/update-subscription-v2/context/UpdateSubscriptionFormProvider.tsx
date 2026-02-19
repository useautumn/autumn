import type {
	Feature,
	FrontendProduct,
	FullCusProduct,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { productV2ToFrontendProduct } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import { applyDefinedFormPatchFields } from "@/components/forms/shared/utils/formPatchUtils";
import {
	type UseUpdateSubscriptionPreviewReturn,
	useUpdateSubscriptionPreview,
} from "@/components/forms/update-subscription/use-update-subscription-preview";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductVersionQuery } from "@/hooks/queries/useProductVersionQuery";
import type { PrepaidItemWithFeature } from "@/hooks/stores/useProductStore";
import { useHasBillingChanges } from "@/hooks/stores/useProductStore";
import { useHasSubscriptionChanges } from "../hooks/useHasSubscriptionChanges";
import {
	type UseTrialStateReturn,
	useTrialState,
} from "../hooks/useTrialState";
import {
	type UseUpdateSubscriptionForm,
	useUpdateSubscriptionForm,
} from "../hooks/useUpdateSubscriptionForm";
import { useUpdateSubscriptionMutation } from "../hooks/useUpdateSubscriptionMutation";
import { useUpdateSubscriptionRequestBody } from "../hooks/useUpdateSubscriptionRequestBody";
import type { UpdateSubscriptionForm } from "../updateSubscriptionFormSchema";
import { getFreeTrial } from "../utils/getFreeTrial";
import {
	getProductWithSupportedFormValues,
	getSupportedFormPatchFromDraftProduct,
} from "../utils/subscriptionCustomization";

export interface UpdateSubscriptionFormContext {
	customerId: string | undefined;
	product: ProductV2 | undefined;
	entityId: string | undefined;
	customerProduct: FullCusProduct;
	prepaidItems: PrepaidItemWithFeature[];
	numVersions: number;
	currentVersion: number;
}

interface UpdateSubscriptionFormContextValue {
	// Core data
	formContext: UpdateSubscriptionFormContext;
	form: UseUpdateSubscriptionForm;
	formValues: UpdateSubscriptionForm;
	features: Feature[];

	// Trial state
	trialState: UseTrialStateReturn;

	// Derived values
	originalItems: ProductItem[] | undefined;
	initialPrepaidOptions: Record<string, number>;
	changedPrepaidOptions: Record<string, number> | undefined;
	productWithFormItems: FrontendProduct | undefined;
	isVersionReady: boolean;
	hasChanges: boolean;
	hasNoBillingChanges: boolean;

	// Preview
	previewQuery: UseUpdateSubscriptionPreviewReturn;

	// Plan editor state
	showPlanEditor: boolean;
	handleEditPlan: () => void;
	handlePlanEditorSave: (product: FrontendProduct) => void;
	handlePlanEditorCancel: () => void;

	// Mutation
	isPending: boolean;
	handleConfirm: () => void;
	handleInvoiceUpdate: (params: { enableProductImmediately: boolean }) => void;
}

const UpdateSubscriptionFormReactContext =
	createContext<UpdateSubscriptionFormContextValue | null>(null);

interface UpdateSubscriptionFormProviderProps {
	formContext: UpdateSubscriptionFormContext;
	originalItems: ProductItem[] | undefined;
	defaultOverrides?: Partial<UpdateSubscriptionForm>;
	onPlanEditorOpen?: () => void;
	onPlanEditorClose?: () => void;
	onInvoiceCreated?: (invoiceId: string) => void;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
	children: ReactNode;
}

type UpdateEditablePatchFields = Pick<
	UpdateSubscriptionForm,
	| "items"
	| "version"
	| "trialEnabled"
	| "removeTrial"
	| "trialLength"
	| "trialDuration"
	| "trialCardRequired"
>;

const UPDATE_EDITABLE_PATCH_FIELDS = [
	"items",
	"version",
	"trialEnabled",
	"removeTrial",
	"trialLength",
	"trialDuration",
	"trialCardRequired",
] as const satisfies ReadonlyArray<keyof UpdateEditablePatchFields>;

export function UpdateSubscriptionFormProvider({
	formContext,
	originalItems,
	defaultOverrides,
	onPlanEditorOpen,
	onPlanEditorClose,
	onInvoiceCreated,
	onCheckoutRedirect,
	onSuccess,
	children,
}: UpdateSubscriptionFormProviderProps) {
	const { customerProduct, prepaidItems, currentVersion, product } =
		formContext;

	const [showPlanEditor, setShowPlanEditor] = useState(false);

	const form = useUpdateSubscriptionForm({
		updateSubscriptionFormContext: formContext,
		defaultOverrides,
	});
	const { features } = useFeaturesQuery();
	const trialState = useTrialState({ form, customerProduct });

	const formValues = useStore(form.store, (state) => state.values);
	const { prepaidOptions } = formValues;

	// Fetch the target version's product data when version differs from current
	const isVersionChanged = formValues.version !== currentVersion;
	const versionProductQuery = useProductVersionQuery({
		productId: product?.id,
		version: formValues.version,
		enabled: isVersionChanged,
	});

	// Use the target version's product when a different version is selected
	const isVersionReady = isVersionChanged && !!versionProductQuery.data;
	const effectiveProduct = useMemo((): ProductV2 | undefined => {
		if (isVersionReady) {
			return versionProductQuery.data?.product;
		}
		return product;
	}, [product, isVersionReady, versionProductQuery.data]);

	const defaultValues = form.options.defaultValues;
	const initialPrepaidOptions = defaultValues?.prepaidOptions ?? {};

	const hasChanges = useHasSubscriptionChanges({
		formValues,
		initialPrepaidOptions,
		prepaidItems,
		customerProduct,
		currentVersion,
		originalItems,
		features,
	});

	const changedPrepaidOptions = useMemo(() => {
		const changed: Record<string, number> = {};
		for (const [featureId, quantity] of Object.entries(prepaidOptions)) {
			if (quantity !== initialPrepaidOptions[featureId]) {
				changed[featureId] = quantity;
			}
		}
		return Object.keys(changed).length > 0 ? changed : undefined;
	}, [prepaidOptions, initialPrepaidOptions]);

	const productWithFormItems = useMemo((): FrontendProduct | undefined => {
		if (!effectiveProduct) return undefined;

		const baseFrontendProduct = productV2ToFrontendProduct({
			product: effectiveProduct as ProductV2,
		});

		return getProductWithSupportedFormValues({
			baseProduct: baseFrontendProduct,
			formValues,
		});
	}, [effectiveProduct, formValues]);

	const baseProduct = useMemo((): FrontendProduct | undefined => {
		if (!product) return undefined;
		return productV2ToFrontendProduct({ product: product as ProductV2 });
	}, [product]);

	const newProduct = useMemo((): FrontendProduct | undefined => {
		if (!effectiveProduct) return undefined;

		const base = productV2ToFrontendProduct({
			product: effectiveProduct as ProductV2,
		});

		return getProductWithSupportedFormValues({
			baseProduct: base,
			formValues,
		});
	}, [effectiveProduct, formValues]);

	const hasBillingChanges = useHasBillingChanges({
		baseProduct: baseProduct as FrontendProduct,
		newProduct: newProduct as FrontendProduct,
	});

	const hasPrepaidQuantityChanges = changedPrepaidOptions !== undefined;
	const isVersionLoading = isVersionChanged && !isVersionReady;
	const hasNoBillingChanges =
		hasChanges &&
		!hasBillingChanges &&
		!hasPrepaidQuantityChanges &&
		!isVersionLoading;

	const freeTrial = getFreeTrial({
		removeTrial: formValues.removeTrial,
		trialLength: formValues.trialLength,
		trialDuration: formValues.trialDuration,
		trialEnabled: formValues.trialEnabled,
		trialCardRequired: formValues.trialCardRequired,
	});

	const previewQuery = useUpdateSubscriptionPreview({
		updateSubscriptionFormContext: formContext,
		prepaidOptions: changedPrepaidOptions,
		freeTrial,
		items: formValues.items,
		version: formValues.version,
		cancelAction: formValues.cancelAction,
		billingBehavior: formValues.billingBehavior,
		refundBehavior: formValues.refundBehavior,
	});

	const { buildRequestBody } = useUpdateSubscriptionRequestBody({
		updateSubscriptionFormContext: formContext,
		form,
	});

	const { handleConfirm, handleInvoiceUpdate, isPending } =
		useUpdateSubscriptionMutation({
			updateSubscriptionFormContext: formContext,
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

			const patch = getSupportedFormPatchFromDraftProduct({
				baseProduct: productWithFormItems,
				draftProduct,
				isCurrentlyTrialing: trialState.isCurrentlyTrialing,
			});

			const updatePatch = {
				items: patch.items,
				version: patch.version,
				trialEnabled: patch.trialEnabled,
				removeTrial: patch.removeTrial,
				trialLength: patch.trialLength,
				trialDuration: patch.trialDuration,
				trialCardRequired: patch.trialCardRequired,
			} satisfies Partial<UpdateEditablePatchFields>;

			applyDefinedFormPatchFields<
				UpdateEditablePatchFields,
				keyof UpdateEditablePatchFields
			>({
				patch: updatePatch,
				fields: UPDATE_EDITABLE_PATCH_FIELDS,
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
		[
			form,
			onPlanEditorClose,
			productWithFormItems,
			trialState.isCurrentlyTrialing,
		],
	);

	const handlePlanEditorCancel = useCallback(() => {
		setShowPlanEditor(false);
		onPlanEditorClose?.();
	}, [onPlanEditorClose]);

	const value = useMemo<UpdateSubscriptionFormContextValue>(
		() => ({
			formContext,
			form,
			formValues,
			features,
			trialState,
			originalItems,
			initialPrepaidOptions,
			changedPrepaidOptions,
			productWithFormItems,
			isVersionReady,
			hasChanges,
			hasNoBillingChanges,
			previewQuery,
			showPlanEditor,
			handleEditPlan,
			handlePlanEditorSave,
			handlePlanEditorCancel,
			isPending,
			handleConfirm,
			handleInvoiceUpdate,
		}),
		[
			formContext,
			form,
			formValues,
			features,
			trialState,
			originalItems,
			initialPrepaidOptions,
			changedPrepaidOptions,
			productWithFormItems,
			isVersionReady,
			hasChanges,
			hasNoBillingChanges,
			previewQuery,
			showPlanEditor,
			handleEditPlan,
			handlePlanEditorSave,
			handlePlanEditorCancel,
			isPending,
			handleConfirm,
			handleInvoiceUpdate,
		],
	);

	return (
		<UpdateSubscriptionFormReactContext.Provider value={value}>
			{children}
		</UpdateSubscriptionFormReactContext.Provider>
	);
}

export function useUpdateSubscriptionFormContext(): UpdateSubscriptionFormContextValue {
	const context = useContext(UpdateSubscriptionFormReactContext);
	if (!context) {
		throw new Error(
			"useUpdateSubscriptionFormContext must be used within UpdateSubscriptionFormProvider",
		);
	}
	return context;
}

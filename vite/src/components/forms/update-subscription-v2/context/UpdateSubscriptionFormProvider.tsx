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
import {
	type UseUpdateSubscriptionPreviewReturn,
	useUpdateSubscriptionPreview,
} from "@/components/forms/update-subscription/use-update-subscription-preview";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
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
	hasChanges: boolean;
	hasNoBillingChanges: boolean;

	// Preview
	previewQuery: UseUpdateSubscriptionPreviewReturn;

	// Plan editor state
	showPlanEditor: boolean;
	handleEditPlan: () => void;
	handlePlanEditorSave: (items: ProductItem[]) => void;
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
		if (!product) return undefined;

		const baseFrontendProduct = productV2ToFrontendProduct({
			product: product as ProductV2,
		});

		if (formValues.items) {
			return {
				...baseFrontendProduct,
				items: formValues.items,
			};
		}

		return baseFrontendProduct;
	}, [product, formValues.items]);

	const baseProduct = useMemo((): FrontendProduct | undefined => {
		if (!product) return undefined;
		return productV2ToFrontendProduct({ product: product as ProductV2 });
	}, [product]);

	const newProduct = useMemo((): FrontendProduct | undefined => {
		if (!product) return undefined;

		const base = productV2ToFrontendProduct({ product: product as ProductV2 });

		const freeTrial = getFreeTrial({
			removeTrial: formValues.removeTrial,
			trialLength: formValues.trialLength,
			trialDuration: formValues.trialDuration,
			trialEnabled: formValues.trialEnabled,
		});
		const freeTrialValue =
			freeTrial === null ? undefined : (freeTrial ?? base.free_trial);

		return {
			...base,
			items: formValues.items ?? base.items,
			free_trial: freeTrialValue,
		};
	}, [
		product,
		formValues.items,
		formValues.removeTrial,
		formValues.trialLength,
		formValues.trialDuration,
		formValues.trialEnabled,
	]);

	const hasBillingChanges = useHasBillingChanges({
		baseProduct: baseProduct as FrontendProduct,
		newProduct: newProduct as FrontendProduct,
	});

	const hasPrepaidQuantityChanges = changedPrepaidOptions !== undefined;
	const hasNoBillingChanges =
		hasChanges && !hasBillingChanges && !hasPrepaidQuantityChanges;

	const freeTrial = getFreeTrial({
		removeTrial: formValues.removeTrial,
		trialLength: formValues.trialLength,
		trialDuration: formValues.trialDuration,
		trialEnabled: formValues.trialEnabled,
	});

	const previewQuery = useUpdateSubscriptionPreview({
		updateSubscriptionFormContext: formContext,
		prepaidOptions: changedPrepaidOptions,
		freeTrial,
		items: formValues.items,
		version: formValues.version,
		cancelAction: formValues.cancelAction,
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
		(items: ProductItem[]) => {
			form.setFieldValue("items", items);

			const currentPrepaidOptions = form.store.state.values.prepaidOptions;
			const updatedPrepaidOptions = { ...currentPrepaidOptions };
			let hasNewPrepaidItems = false;

			for (const item of items) {
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

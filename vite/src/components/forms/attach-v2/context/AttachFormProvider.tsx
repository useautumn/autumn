import type {
	CusProduct,
	CustomizePlanLicense,
	Feature,
	FrontendProduct,
	FullCusProduct,
	FullCustomer,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import {
	ACTIVE_STATUSES,
	CusProductStatus,
	cusProductToPrices,
	FreeTrialDuration,
	isFreeProduct,
	isFreeProductV2,
	isOneOffProductV2,
	normalizeResetInterval,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { SchedulePlan } from "@/components/forms/create-schedule/createScheduleFormSchema";
import { BILLING_OPERATIONS } from "@/components/forms/shared/utils/billingOperations";
import { getProductWithSupportedPlanFormValues } from "@/components/forms/shared/utils/planCustomizationUtils";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductVersionQuery } from "@/hooks/queries/useProductVersionQuery";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import type { AttachForm } from "../attachFormSchema";
import {
	type UseAttachAdditionalPlansReturn,
	useAttachAdditionalPlans,
} from "../hooks/useAttachAdditionalPlans";
import {
	type UseAttachBillingOptionsStateReturn,
	useAttachBillingOptionsState,
} from "../hooks/useAttachBillingOptionsState";
import {
	type UseAttachCurrencyReturn,
	useAttachCurrency,
} from "../hooks/useAttachCurrency";
import { type UseAttachForm, useAttachForm } from "../hooks/useAttachForm";
import { useAttachMultiRequestBody } from "../hooks/useAttachMultiRequestBody";
import { useAttachMutation } from "../hooks/useAttachMutation";
import { useAttachPlanEditor } from "../hooks/useAttachPlanEditor";
import {
	type UseAttachPreviewReturn,
	useAttachPreview,
} from "../hooks/useAttachPreview";
import { useAttachRequestBody } from "../hooks/useAttachRequestBody";
import {
	type UsePreviewDiffReturn,
	usePreviewDiff,
} from "../hooks/usePreviewDiff";

interface AttachFormContextValue {
	customerId: string | undefined;
	customer: FullCustomer | null;
	form: UseAttachForm;
	formValues: AttachForm;
	features: Feature[];

	entityId: string | undefined;
	onScopeChange?: (entityId: string | undefined) => void;

	product: ProductV2 | undefined;
	products: ProductV2[];
	originalItems: ProductItem[] | undefined;
	productWithFormItems: FrontendProduct | undefined;
	hasCustomizations: boolean;
	numVersions: number;
	initialPrepaidOptions: Record<string, number>;
	previewPrepaidOptions: Record<string, number>;

	hasActiveSubscription: boolean;
	isAutoSelectingImmediateSchedule: boolean;
	billingOptions: UseAttachBillingOptionsStateReturn;

	additionalPlans: UseAttachAdditionalPlansReturn;

	attachCurrency: UseAttachCurrencyReturn;

	previewQuery: UseAttachPreviewReturn;
	previewDiff: UsePreviewDiffReturn;

	planEditorProduct: FrontendProduct | undefined;
	showPlanEditor: boolean;
	handleEditPlan: (params?: { additionalPlanId?: string }) => void;
	handlePlanEditorSave: (
		product: FrontendProduct,
		addLicenses?: CustomizePlanLicense[],
	) => void;
	handlePlanEditorCancel: () => void;

	isPending: boolean;
	handleConfirm: (params?: { enableProductImmediately?: boolean }) => void;
	handleInvoiceAttach: (params: {
		enableProductImmediately: boolean;
		finalizeInvoice?: boolean;
		invoiceTemplateId?: string;
		netTermsDays?: number;
	}) => Promise<{
		stripeId: string | undefined;
		hostedInvoiceUrl: string | null | undefined;
	}>;
	handleCheckoutAttach: (params?: { longLivedCheckout?: boolean }) => Promise<{
		paymentUrl: string | null | undefined;
	}>;
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
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
	onScopeChange?: (entityId: string | undefined) => void;
	initialSchedulePlan?: SchedulePlan | null;
	disablePreview?: boolean;
	allowMultiplePlans?: boolean;
	children: ReactNode;
}

export function AttachFormProvider({
	customerId,
	entityId,
	initialProductId,
	onPlanEditorOpen,
	onPlanEditorClose,
	onCheckoutRedirect,
	onSuccess,
	onScopeChange,
	initialSchedulePlan,
	disablePreview,
	allowMultiplePlans = false,
	children,
}: AttachFormProviderProps) {
	const [initialPrepaidOptions, setInitialPrepaidOptions] = useState<
		Record<string, number>
	>({});

	const form = useAttachForm({
		initialProductId,
		initialItems: initialSchedulePlan?.items,
		initialIsCustom: initialSchedulePlan?.isCustom,
		initialVersion: initialSchedulePlan?.version,
		initialPrepaidOptions: initialSchedulePlan?.prepaidOptions,
	});

	const { features } = useFeaturesQuery();
	const { products } = useProductsQuery();

	const formValues = useStore(form.store, (state) => state.values);
	const {
		productId,
		additionalPlans: additionalPlanValues,
		prepaidOptions,
		licenseQuantities,
		items,
		addLicenses,
		version,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
		trialOnEnd,
		planSchedule,
		startDate,
		endDate,
		prorationBehavior,
		redirectMode,
		newBillingSubscription,
		resetBillingCycle,
		discounts,
		grantFree,
		currency,
		noBillingChanges,
		enablePlanImmediately,
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
		const resolved =
			isVersionChanged && versionProductQuery.data
				? versionProductQuery.data.product
				: product;
		if (!resolved) return resolved;

		// Normalize mirrored intervals so editing does not split price and reset.
		return {
			...resolved,
			items: (resolved.items as ProductItem[]).map(normalizeResetInterval),
		};
	}, [product, isVersionChanged, versionProductQuery.data]);

	const { customer } = useCusQuery();
	const fullCustomer = customer as FullCustomer | null;

	const isFreeToPaidTransition = useMemo(() => {
		if (!effectiveProduct || !fullCustomer) return false;
		if (effectiveProduct.is_add_on) return false;

		const isIncomingFree = isFreeProductV2({ items: effectiveProduct.items });
		const isIncomingOneOff = isOneOffProductV2({
			items: effectiveProduct.items,
		});
		if (isIncomingFree || isIncomingOneOff) return false;

		const outgoingCustomerProduct = fullCustomer.customer_products.find(
			(customerProduct: FullCusProduct) => {
				if (customerProduct.product.is_add_on) return false;

				const hasActiveOrTrialing =
					ACTIVE_STATUSES.includes(customerProduct.status) ||
					customerProduct.status === CusProductStatus.Trialing;
				if (!hasActiveOrTrialing) return false;

				const groupMatches =
					(customerProduct.product.group || "") ===
					(effectiveProduct.group || "");
				if (!groupMatches) return false;

				const entityMatches = entityId
					? customerProduct.entity_id === entityId ||
						customerProduct.internal_entity_id === entityId
					: !customerProduct.internal_entity_id;
				return entityMatches;
			},
		);

		if (!outgoingCustomerProduct) return false;

		const outgoingPrices = cusProductToPrices({
			cusProduct: outgoingCustomerProduct,
		});
		return isFreeProduct({ prices: outgoingPrices });
	}, [effectiveProduct, fullCustomer, entityId]);

	const hasActiveSubscription = useMemo(
		() =>
			((fullCustomer?.customer_products ?? []) as CusProduct[]).some(
				(customerProduct) =>
					(ACTIVE_STATUSES.includes(customerProduct.status) ||
						customerProduct.status === CusProductStatus.Trialing) &&
					customerProduct.subscription_ids &&
					customerProduct.subscription_ids.length > 0,
			),
		[fullCustomer?.customer_products],
	);

	const disableProration = isFreeToPaidTransition && !hasActiveSubscription;

	const additionalPlans = useAttachAdditionalPlans({
		form,
		formValues,
		products,
		customer: fullCustomer,
		entityId,
		enabled: allowMultiplePlans,
	});
	const { isMultiPlan } = additionalPlans;

	// The currency must be offered by every plan being attached, so feed the
	// hook all selected plans' items — it intersects across charging items.
	const currencyItems = useMemo(() => {
		if (grantFree) return [];
		const primaryItems =
			items ?? (effectiveProduct?.items as ProductItem[] | null) ?? [];
		if (!isMultiPlan) return primaryItems;

		const additionalItems = additionalPlanValues.flatMap((plan) => {
			if (plan.items) return plan.items;
			const planProduct = products.find(
				(product) => product.id === plan.productId,
			);
			return (planProduct?.items as ProductItem[] | undefined) ?? [];
		});
		return [...primaryItems, ...additionalItems];
	}, [
		items,
		effectiveProduct?.items,
		grantFree,
		isMultiPlan,
		additionalPlanValues,
		products,
	]);

	const attachCurrency = useAttachCurrency({
		items: currencyItems,
		customerCurrency: fullCustomer?.currency,
		selectedCurrency: currency,
	});

	// Track product changes and initialize prepaid options
	const previousProductIdRef = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (!product) return;
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
			form.setFieldValue("addLicenses", null);
			form.setFieldValue("licenseQuantities", {});
			form.setFieldValue("version", undefined);
			form.setFieldValue("trialEnabled", false);
			form.setFieldValue("trialLength", null);
			form.setFieldValue("trialDuration", FreeTrialDuration.Day);
			form.setFieldValue("trialCardRequired", true);
			form.setFieldValue("trialOnEnd", "bill");
			form.setFieldValue("grantFree", false);
			form.setFieldValue("currency", null);
		}

		// Initialize prepaid options for the selected product.
		// Values start as undefined (not 0) so that unset quantities are omitted
		// from the request — the backend carries over existing prepaid balances
		// when no option is provided for a feature.
		const currentPrepaidOptions = form.store.state.values.prepaidOptions;
		const resolvedPrepaidOptions =
			isProductChange || Object.keys(currentPrepaidOptions).length === 0
				? {}
				: { ...currentPrepaidOptions };
		form.setFieldValue("prepaidOptions", resolvedPrepaidOptions);
		setInitialPrepaidOptions(resolvedPrepaidOptions as Record<string, number>);

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
			form.setFieldValue("trialOnEnd", product.free_trial.on_end ?? "bill");
		}
	}, [productId, product, form]);

	const originalItems = effectiveProduct?.items as ProductItem[] | undefined;

	const hasCustomizations =
		items !== null || (!isMultiPlan && addLicenses !== null);

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

	const {
		planEditorProduct,
		showPlanEditor,
		handleEditPlan,
		handlePlanEditorSave,
		handlePlanEditorCancel,
	} = useAttachPlanEditor({
		form,
		formValues,
		products,
		productWithFormItems,
		onOpen: onPlanEditorOpen,
		onClose: onPlanEditorClose,
	});

	const { requestBody, buildRequestBody } = useAttachRequestBody({
		customerId,
		entityId,
		product: effectiveProduct,
		prepaidOptions,
		licenseQuantities,
		items,
		addLicenses,
		grantFree,
		version,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
		trialOnEnd,
		planSchedule,
		startDate,
		endDate,
		prorationBehavior,
		redirectMode,
		newBillingSubscription,
		resetBillingCycle,
		discounts,
		noBillingChanges,
		enablePlanImmediately,
		carryOverBalances,
		carryOverBalanceFeatureIds,
		carryOverUsages,
		carryOverUsageFeatureIds,
		customLineItems,
		disableProration,
		currency: attachCurrency.requestCurrency,
	});
	const {
		requestBody: multiRequestBody,
		buildRequestBody: buildMultiRequestBody,
	} = useAttachMultiRequestBody({
		customerId,
		entityId,
		product: effectiveProduct,
		products,
		features,
		additionalPlans: additionalPlanValues,
		prepaidOptions,
		items,
		grantFree,
		version,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
		trialOnEnd,
		prorationBehavior,
		redirectMode,
		discounts,
		currency: attachCurrency.requestCurrency,
		startDate,
		hasInvalidPlanScopes: additionalPlans.hasInvalidPlanScopes,
	});
	const billingOperation = isMultiPlan
		? BILLING_OPERATIONS.multiAttach
		: BILLING_OPERATIONS.attach;
	const operationRequestBody = isMultiPlan ? multiRequestBody : requestBody;
	const buildOperationRequestBody = isMultiPlan
		? buildMultiRequestBody
		: buildRequestBody;

	const previewQuery = useAttachPreview({
		path: billingOperation.previewPath,
		requestBody: operationRequestBody,
		enabled: disablePreview ? false : undefined,
	});
	const isAutoSelectingImmediateSchedule =
		!isMultiPlan &&
		hasActiveSubscription &&
		planSchedule === null &&
		(previewQuery.data?.outgoing.length ?? 0) === 0 &&
		previewQuery.isError &&
		!previewQuery.isLoading;

	useEffect(() => {
		if (!isAutoSelectingImmediateSchedule) return;
		form.setFieldValue("planSchedule", "immediate");
	}, [form, isAutoSelectingImmediateSchedule]);

	const billingOptions = useAttachBillingOptionsState({
		form,
		formValues,
		previewQuery,
		customerProducts: fullCustomer?.customer_products ?? [],
		isFreeToPaidTransition,
		hasActiveSubscription,
		isMultiPlan,
	});

	const previewPrepaidOptions = useMemo(() => {
		const incoming = previewQuery.data?.incoming;
		if (!incoming || incoming.length === 0) return {};

		const options: Record<string, number> = {};
		for (const change of incoming) {
			for (const featureQuantity of change.feature_quantities) {
				options[featureQuantity.feature_id] = featureQuantity.quantity;
			}
		}
		return options;
	}, [previewQuery.data?.incoming]);

	const previewDiff = usePreviewDiff({
		previewQuery,
		productId: productId ?? "",
		items,
		version,
		incomingItems: originalItems,
		enabled: !isMultiPlan,
	});

	const {
		handleConfirm,
		handleInvoiceAttach,
		handleCheckoutAttach,
		isPending,
	} = useAttachMutation({
		customerId,
		buildRequestBody: buildOperationRequestBody,
		path: billingOperation.path,
		invalidatesSchedule: billingOperation.invalidatesSchedule,
		onCheckoutRedirect,
		onSuccess,
	});

	const value = useMemo<AttachFormContextValue>(
		() => ({
			form,
			customerId,
			customer: fullCustomer,
			formValues,
			features,
			entityId,
			onScopeChange,
			product: effectiveProduct,
			products,
			originalItems,
			productWithFormItems,
			hasCustomizations,
			numVersions,
			initialPrepaidOptions,
			previewPrepaidOptions,
			hasActiveSubscription,
			isAutoSelectingImmediateSchedule,
			billingOptions,
			additionalPlans,
			attachCurrency,
			previewQuery,
			previewDiff,
			planEditorProduct,
			showPlanEditor,
			handleEditPlan,
			handlePlanEditorSave,
			handlePlanEditorCancel,
			isPending,
			handleConfirm,
			handleInvoiceAttach,
			handleCheckoutAttach,
		}),
		[
			form,
			customerId,
			fullCustomer,
			formValues,
			features,
			entityId,
			onScopeChange,
			effectiveProduct,
			products,
			originalItems,
			productWithFormItems,
			hasCustomizations,
			numVersions,
			initialPrepaidOptions,
			previewPrepaidOptions,
			hasActiveSubscription,
			isAutoSelectingImmediateSchedule,
			billingOptions,
			additionalPlans,
			attachCurrency,
			previewQuery,
			previewDiff,
			planEditorProduct,
			showPlanEditor,
			handleEditPlan,
			handlePlanEditorSave,
			handlePlanEditorCancel,
			isPending,
			handleConfirm,
			handleInvoiceAttach,
			handleCheckoutAttach,
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

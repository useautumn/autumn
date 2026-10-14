import type {
	Feature,
	FullCustomer,
	ProductV2,
	SetPlansPreviewDiscount,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import {
	ACTIVE_STATUSES,
	acceptsCarryOverUsages,
	anchorFollowsKeptTrial,
	type BillingBehavior,
	CusProductStatus,
	isFreeProductV2,
	isOneOffProductV2,
	type ProrationBehaviorOverride,
	prorationBehaviorOverride,
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
import { CustomerStateProvider } from "@/components/forms/customer-state/CustomerStateProvider";
import {
	type CustomerStateForm,
	type CustomerStatePlan,
	getCreateSchedulePhaseTimingError,
	hasPersistedCreateSchedule,
} from "@/components/forms/customer-state/customerStateSchema";
import { scopeCustomerProducts } from "@/components/forms/customer-state/scopeCustomerProducts";
import type { SubscriptionLinks } from "@/components/forms/customer-state/types/subscriptionLinks";
import {
	type UseCustomerStateForm,
	useCustomerStateForm,
} from "@/components/forms/customer-state/useCustomerStateForm";
import {
	type FindSubscriptionConflict,
	findSubscriptionConflict,
} from "@/components/forms/customer-state/utils/findSubscriptionConflict";
import type { BillingGenerationState } from "@/components/forms/shared/generation/BillingPromptBar";
import type { SendInvoiceSubmitParams } from "@/components/forms/shared/SendInvoiceStage";
import { defaultProrationBehavior } from "@/components/forms/shared/utils/defaultProrationBehavior";
import { filterSubscriptionDiscounts } from "@/components/forms/shared/utils/filterSubscriptionDiscounts";
import { applyFreeTrialFormValues } from "@/components/forms/shared/utils/freeTrialForm";
import { pickFreeTrialFormValues } from "@/components/forms/shared/utils/freeTrialFormValues";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCreateScheduleGeneration } from "../hooks/useCreateScheduleGeneration";
import { useCreateScheduleMutation } from "../hooks/useCreateScheduleMutation";
import { useCreateSchedulePreview } from "../hooks/useCreateSchedulePreview";
import {
	useBuildCreateScheduleRequestBody,
	useCreateScheduleRequestBody,
} from "../hooks/useCreateScheduleRequestBody";
import type { SetPlansSubscriptionTarget } from "../types/setPlansSubscriptionTarget";
import { firstPhaseReplacesPlanNow } from "../utils/firstPhaseReplacesPlanNow";
import {
	type CurrentScheduleTrial,
	canScheduleFreeTrial,
	defaultScheduleTrialFormValues,
	endsCurrentTrialNow,
	findCatalogScheduleTrial,
	findCurrentScheduleTrial,
	reseededScheduleTrialFormValues,
} from "../utils/scheduleFreeTrial";
import {
	firstPhaseBackdatesLiveSubscription,
	firstPhaseStartsLater,
} from "../utils/schedulePhaseTiming";

interface CreateScheduleFormContextValue {
	generation: BillingGenerationState;
	form: UseCustomerStateForm;
	formValues: CustomerStateForm;
	customerId: string | undefined;
	nowMs: number;
	products: ProductV2[];
	features: Feature[];
	isExistingSchedule: boolean;
	allowFirstPhaseBackdate: boolean;
	allowStartedPhaseBackdate: boolean;
	backdatesLiveSubscription: boolean;
	hasActiveSubscription: boolean;
	carriesUsageNow: boolean;
	defaultFirstPhaseProration: BillingBehavior;
	prorationOverride: ProrationBehaviorOverride | undefined;
	createsRecurringSubscription: boolean;
	subscriptionTarget: SetPlansSubscriptionTarget | null;
	currentTrial: CurrentScheduleTrial | null;
	canScheduleTrial: boolean;
	isPending: boolean;
	handleSubmit: () => void;
	handleInvoiceSubmit: (params: SendInvoiceSubmitParams) => Promise<{
		stripeId: string | undefined;
		hostedInvoiceUrl: string | null | undefined;
	}>;
	handleCheckoutSubmit: () => Promise<{
		paymentUrl: string | null | undefined;
	}>;
	preview: SetPlansPreviewResponse | null | undefined;
	appliedDiscounts: SetPlansPreviewDiscount[];
	previewQuery: { data: SetPlansPreviewResponse | null | undefined };
	isPreviewLoading: boolean;
	error: Error | null;
}

const CreateScheduleFormReactContext =
	createContext<CreateScheduleFormContextValue | null>(null);

interface CreateScheduleFormProviderProps {
	customerId: string | undefined;
	nowMs?: number;
	initialValues?: CustomerStateForm;
	existingPlans?: CustomerStatePlan[];
	subscriptionTarget?: SetPlansSubscriptionTarget | null;
	subscriptionLinks?: SubscriptionLinks | null;
	onApplied?: () => void;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
	children: ReactNode;
}

const NO_EXISTING_PLANS: CustomerStatePlan[] = [];

export function CreateScheduleFormProvider({
	customerId,
	nowMs: nowMsProp,
	initialValues,
	existingPlans = NO_EXISTING_PLANS,
	subscriptionTarget = null,
	subscriptionLinks = null,
	onApplied,
	onCheckoutRedirect,
	onSuccess,
	children,
}: CreateScheduleFormProviderProps) {
	const [nowMsFallback] = useState(Date.now);
	const nowMs = nowMsProp ?? nowMsFallback;
	const stripeSubscriptionId = subscriptionTarget?.stripeSubscriptionId ?? null;
	const form = useCustomerStateForm({ initialValues });
	const { features } = useFeaturesQuery();
	const { products } = useProductsQuery();

	const formValues = useStore(form.store, (state) => state.values);
	const isExistingSchedule = useMemo(
		() => hasPersistedCreateSchedule({ phases: formValues.phases }),
		[formValues.phases],
	);

	const { customer } = useCusQuery();
	const fullCustomer = customer as FullCustomer | null;
	const stripeScheduleId = subscriptionTarget?.stripeScheduleId ?? null;
	const scopedCustomerProducts = useMemo(
		() =>
			scopeCustomerProducts({
				customerProducts: fullCustomer?.customer_products ?? [],
				stripeSubscriptionId,
				stripeScheduleId,
			}),
		[fullCustomer?.customer_products, stripeSubscriptionId, stripeScheduleId],
	);
	const hasScheduledPlans = useMemo(
		() =>
			scopedCustomerProducts.some(
				(customerProduct) =>
					customerProduct.status === CusProductStatus.Scheduled,
			),
		[scopedCustomerProducts],
	);

	const hasActiveSubscription = useMemo(() => {
		const openingScopes = new Set(
			(formValues.phases[0]?.plans ?? [])
				.filter((plan) => plan.productId)
				.map((plan) => plan.entityId ?? null),
		);
		return scopedCustomerProducts.some((cusProduct) => {
			const activeOrTrialing =
				ACTIVE_STATUSES.includes(cusProduct.status) ||
				cusProduct.status === CusProductStatus.Trialing;
			if (!activeOrTrialing) return false;
			if (!cusProduct.subscription_ids?.length) return false;
			if (!cusProduct.internal_entity_id) return openingScopes.has(null);
			return (
				openingScopes.has(cusProduct.entity_id ?? "") ||
				openingScopes.has(cusProduct.internal_entity_id)
			);
		});
	}, [scopedCustomerProducts, formValues.phases]);

	const immediatePlansPaidRecurring = useMemo(() => {
		const plans = (formValues.phases[0]?.plans ?? []).filter(
			(plan) => plan.productId,
		);
		if (plans.length === 0) return false;
		return plans.every((plan) => {
			const product = products.find((p) => p.id === plan.productId);
			if (!product) return false;
			return (
				!isFreeProductV2({ items: product.items }) &&
				!isOneOffProductV2({ items: product.items })
			);
		});
	}, [formValues.phases, products]);

	const allowFirstPhaseBackdate =
		!isExistingSchedule && immediatePlansPaidRecurring;
	const allowStartedPhaseBackdate =
		isExistingSchedule && immediatePlansPaidRecurring && hasActiveSubscription;

	const backdatesLiveSubscription = firstPhaseBackdatesLiveSubscription({
		phases: formValues.phases,
		nowMs,
		isExistingSchedule,
		hasActiveSubscription,
	});

	const createsRecurringSubscription =
		!hasActiveSubscription && immediatePlansPaidRecurring;

	const currentTrial = useMemo(
		() =>
			findCurrentScheduleTrial({
				customerProducts: scopedCustomerProducts,
				nowMs,
			}),
		[scopedCustomerProducts, nowMs],
	);
	const catalogFreeTrial = useMemo(
		() =>
			findCatalogScheduleTrial({
				phases: formValues.phases,
				products,
				customerProducts: fullCustomer?.customer_products ?? [],
			}),
		[formValues.phases, products, fullCustomer?.customer_products],
	);
	const defaultTrialFormValues = useMemo(
		() => defaultScheduleTrialFormValues({ currentTrial, catalogFreeTrial }),
		[currentTrial, catalogFreeTrial],
	);
	const liveSubscriptionTrialing = currentTrial !== null;
	const canScheduleTrial = canScheduleFreeTrial({
		phases: formValues.phases,
		nowMs,
		liveSubscriptionTrialing,
	});

	const previousDefaultTrialFormValuesRef = useRef(defaultTrialFormValues);
	useEffect(() => {
		const reseededFormValues = reseededScheduleTrialFormValues({
			trialEdited: form.store.state.values.trialEdited,
			previousDefaultFormValues: previousDefaultTrialFormValuesRef.current,
			defaultFormValues: defaultTrialFormValues,
		});
		previousDefaultTrialFormValuesRef.current = defaultTrialFormValues;
		if (reseededFormValues) {
			applyFreeTrialFormValues({ form, values: reseededFormValues });
		}
	}, [defaultTrialFormValues, form]);

	const getPhases = useCallback(
		() => form.store.state.values.phases,
		[form.store],
	);

	const getUnscheduledPlans = useCallback(
		() => form.store.state.values.unscheduledPlans ?? [],
		[form.store],
	);

	const getResetBillingCycle = useCallback(
		() => form.store.state.values.resetBillingCycle ?? false,
		[form.store],
	);

	const getBillingCycleAnchor = useCallback(() => {
		const { billingCycleAnchorMode, billingCycleAnchorDate } =
			form.store.state.values;
		return { billingCycleAnchorMode, billingCycleAnchorDate };
	}, [form.store]);

	const getEndDate = useCallback(
		() => form.store.state.values.endDate,
		[form.store],
	);

	const resetsCycleNow =
		!firstPhaseStartsLater({ phases: formValues.phases, nowMs }) &&
		formValues.resetBillingCycle &&
		!backdatesLiveSubscription &&
		formValues.billingCycleAnchorMode === "now";
	const endsTrialNow = endsCurrentTrialNow({
		phases: formValues.phases,
		nowMs,
		formValues,
		currentTrial,
	});
	const [defaultFirstPhaseProration] = useState(() =>
		defaultProrationBehavior({ noChargesAllowed: hasActiveSubscription }),
	);
	const usesCustomAnchor =
		formValues.resetBillingCycle &&
		formValues.billingCycleAnchorMode === "custom";
	const prorationOverride = prorationBehaviorOverride({
		endsTrialNow,
		resetsCycleNow,
		anchorFollowsKeptTrial: anchorFollowsKeptTrial({
			backdatesTrialingSubscription:
				backdatesLiveSubscription && currentTrial !== null,
			keepsTrial: formValues.trialEnabled,
			anchorMs: usesCustomAnchor ? formValues.billingCycleAnchorDate : null,
			trialEndsAt: currentTrial?.trialEndsAt,
		}),
	});
	const getOmitFirstPhaseProration = useCallback(
		() => prorationOverride !== undefined,
		[prorationOverride],
	);

	const carriesUsageNow = useMemo(
		() =>
			acceptsCarryOverUsages({
				replacesPlanNow: firstPhaseReplacesPlanNow({
					phases: formValues.phases,
					customerProducts: scopedCustomerProducts,
					entities: fullCustomer?.entities ?? [],
					products,
					nowMs,
				}),
				resetsCycleNow,
				endsTrialNow,
			}),
		[
			formValues.phases,
			resetsCycleNow,
			endsTrialNow,
			scopedCustomerProducts,
			fullCustomer?.entities,
			products,
			nowMs,
		],
	);

	const getCarryOverUsages = useCallback(() => {
		const { carryOverUsages, carryOverUsageFeatureIds } =
			form.store.state.values;
		return {
			carryOverUsages: carriesUsageNow && carryOverUsages,
			carryOverUsageFeatureIds,
		};
	}, [form.store, carriesUsageNow]);

	const getEnablePlanImmediately = useCallback(
		() => form.store.state.values.enablePlanImmediately ?? false,
		[form.store],
	);

	const getAllowFirstPhaseBackdate = useCallback(
		() => allowFirstPhaseBackdate,
		[allowFirstPhaseBackdate],
	);

	const { trialEnabled, trialLength, trialDuration, trialCardRequired } =
		formValues;
	const trialFormValues = useMemo(
		() => ({ trialEnabled, trialLength, trialDuration, trialCardRequired }),
		[trialEnabled, trialLength, trialDuration, trialCardRequired],
	);

	const getFreeTrial = useCallback(
		() => pickFreeTrialFormValues(form.store.state.values),
		[form.store],
	);

	const generationRequestBody = useCreateScheduleRequestBody({
		customerId,
		phases: formValues.phases,
		unscheduledPlans: formValues.unscheduledPlans,
		products,
		features,
		nowMs,
		resetBillingCycle: formValues.resetBillingCycle,
		billingCycleAnchorMode: formValues.billingCycleAnchorMode,
		billingCycleAnchorDate: formValues.billingCycleAnchorDate,
		endDate: formValues.endDate,
		allowFirstPhaseBackdate,
		enablePlanImmediately: formValues.enablePlanImmediately,
		carryOverUsages: carriesUsageNow && formValues.carryOverUsages,
		carryOverUsageFeatureIds: formValues.carryOverUsageFeatureIds,
		stripeSubscriptionId,
		freeTrial: trialFormValues,
		currentTrial,
		catalogFreeTrial,
		defaultFirstPhaseProration,
		omitFirstPhaseProration: prorationOverride !== undefined,
		discounts: formValues.discounts,
		removedRewardIds: formValues.removedRewardIds,
	});

	useEffect(() => {
		if (allowFirstPhaseBackdate || isExistingSchedule) return;
		const { phases } = form.store.state.values;
		if (
			phases[0]?.startsAt != null &&
			!firstPhaseStartsLater({ phases, nowMs })
		) {
			form.setFieldValue("phases[0].startsAt", null);
		}
	}, [allowFirstPhaseBackdate, isExistingSchedule, form, nowMs]);

	const phaseTimingError = useMemo(
		() =>
			getCreateSchedulePhaseTimingError({
				phases: formValues.phases,
				nowMs,
			}),
		[formValues.phases, nowMs],
	);

	const {
		data: preview,
		isLoading: isPreviewLoading,
		error: previewError,
	} = useCreateSchedulePreview({ requestBody: generationRequestBody });

	const startsLater = firstPhaseStartsLater({
		phases: formValues.phases,
		nowMs,
	});

	useEffect(() => {
		if (preview?.redirect_to_checkout || startsLater) return;
		if (form.store.state.values.enablePlanImmediately) {
			form.setFieldValue("enablePlanImmediately", false);
		}
	}, [preview?.redirect_to_checkout, startsLater, form]);

	const appliedDiscounts = useMemo(
		() =>
			filterSubscriptionDiscounts({
				discounts: preview?.discounts ?? [],
				subscriptionIds: scopedCustomerProducts.flatMap(
					(customerProduct) => customerProduct.subscription_ids ?? [],
				),
			}),
		[preview?.discounts, scopedCustomerProducts],
	);

	const getDiscounts = useCallback(() => {
		const { discounts, removedRewardIds } = form.store.state.values;
		return {
			discounts,
			removedRewardIds,
			removableRewardIds: appliedDiscounts.map((discount) => discount.id),
		};
	}, [form.store, appliedDiscounts]);

	const buildRequestBody = useBuildCreateScheduleRequestBody({
		customerId,
		products,
		features,
		nowMs,
		getPhases,
		getUnscheduledPlans,
		getResetBillingCycle,
		getBillingCycleAnchor,
		getEndDate,
		getEnablePlanImmediately,
		getAllowFirstPhaseBackdate,
		getCarryOverUsages,
		getFreeTrial,
		getOmitFirstPhaseProration,
		getDiscounts,
		defaultFirstPhaseProration,
		currentTrial,
		catalogFreeTrial,
		stripeSubscriptionId,
	});

	const generation = useCreateScheduleGeneration({
		currentRequest: generationRequestBody as Record<string, unknown> | null,
		customerId,
		form,
	});

	const { handleSubmit, handleInvoiceSubmit, handleCheckoutSubmit, isPending } =
		useCreateScheduleMutation({
			customerId,
			buildRequestBody,
			getEnablePlanImmediately,
			onApplied,
			onCheckoutRedirect,
			onSuccess,
		});

	const previewQuery = useMemo(() => ({ data: preview }), [preview]);

	const value = useMemo<CreateScheduleFormContextValue>(
		() => ({
			generation,
			form,
			formValues,
			customerId,
			nowMs,
			products,
			features,
			isExistingSchedule,
			allowFirstPhaseBackdate,
			allowStartedPhaseBackdate,
			backdatesLiveSubscription,
			hasActiveSubscription,
			carriesUsageNow,
			defaultFirstPhaseProration,
			prorationOverride,
			createsRecurringSubscription,
			subscriptionTarget,
			currentTrial,
			canScheduleTrial,
			isPending,
			handleSubmit,
			handleInvoiceSubmit,
			handleCheckoutSubmit,
			preview,
			appliedDiscounts,
			previewQuery,
			isPreviewLoading,
			error: phaseTimingError ? new Error(phaseTimingError) : previewError,
		}),
		[
			generation,
			form,
			formValues,
			customerId,
			nowMs,
			products,
			features,
			isExistingSchedule,
			allowFirstPhaseBackdate,
			allowStartedPhaseBackdate,
			backdatesLiveSubscription,
			hasActiveSubscription,
			carriesUsageNow,
			defaultFirstPhaseProration,
			prorationOverride,
			createsRecurringSubscription,
			subscriptionTarget,
			currentTrial,
			canScheduleTrial,
			isPending,
			handleSubmit,
			handleInvoiceSubmit,
			handleCheckoutSubmit,
			preview,
			appliedDiscounts,
			previewQuery,
			isPreviewLoading,
			phaseTimingError,
			previewError,
		],
	);

	const findPlanSubscriptionConflict = useCallback<FindSubscriptionConflict>(
		({ product, entityId }) =>
			findSubscriptionConflict({
				customerProducts: fullCustomer?.customer_products ?? [],
				entities: fullCustomer?.entities ?? [],
				stripeSubscriptionId,
				stripeScheduleId,
				product,
				entityId,
			}),
		[fullCustomer, stripeSubscriptionId, stripeScheduleId],
	);

	return (
		<CreateScheduleFormReactContext.Provider value={value}>
			<CustomerStateProvider
				form={form}
				nowMs={nowMs}
				existingPlans={existingPlans}
				canMakeUnscheduled={!hasScheduledPlans}
				findSubscriptionConflict={findPlanSubscriptionConflict}
				subscriptionLinks={subscriptionLinks}
			>
				{children}
			</CustomerStateProvider>
		</CreateScheduleFormReactContext.Provider>
	);
}

export function useCreateScheduleFormContext(): CreateScheduleFormContextValue {
	const context = useContext(CreateScheduleFormReactContext);
	if (!context) {
		throw new Error(
			"useCreateScheduleFormContext must be used within CreateScheduleFormProvider",
		);
	}
	return context;
}

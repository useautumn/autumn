import type {
	BillingPreviewResponse,
	Feature,
	FullCusProduct,
	FullCustomer,
	ProductV2,
} from "@autumn/shared";
import {
	ACTIVE_STATUSES,
	CusProductStatus,
	isFreeProductV2,
	isOneOffProductV2,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { SendInvoiceSubmitParams } from "@/components/forms/shared/SendInvoiceStage";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import {
	type CreateScheduleForm,
	getCreateSchedulePhaseTimingError,
	hasPersistedCreateSchedule,
	type SchedulePlan,
} from "../createScheduleFormSchema";
import {
	type UseCreateScheduleForm,
	useCreateScheduleForm,
} from "../hooks/useCreateScheduleForm";
import { useCreateScheduleMutation } from "../hooks/useCreateScheduleMutation";
import { useCreateSchedulePreview } from "../hooks/useCreateSchedulePreview";
import {
	useBuildCreateScheduleRequestBody,
	useCreateScheduleRequestBody,
} from "../hooks/useCreateScheduleRequestBody";
import { useSchedulePhaseHandlers } from "../hooks/useSchedulePhaseHandlers";

export interface EditingPlan {
	phaseIndex: number;
	planIndex: number;
}

interface CreateScheduleFormContextValue {
	form: UseCreateScheduleForm;
	formValues: CreateScheduleForm;
	customerId: string | undefined;
	entityId: string | undefined;
	nowMs: number;
	products: ProductV2[];
	features: Feature[];
	isExistingSchedule: boolean;
	/** First phase may start in the past — only when a new Stripe subscription will be created. */
	allowFirstPhaseBackdate: boolean;
	isPhaseLocked: ({ phaseIndex }: { phaseIndex: number }) => boolean;

	handleAddPhase: () => void;
	handleInsertPhase: ({ afterIndex }: { afterIndex: number }) => void;
	handleRemovePhase: ({ phaseIndex }: { phaseIndex: number }) => void;
	handleAddPlan: ({ phaseIndex }: { phaseIndex: number }) => void;
	handleRemovePlan: ({
		phaseIndex,
		planIndex,
	}: {
		phaseIndex: number;
		planIndex: number;
	}) => void;
	handleCopyFromPreviousPhase: ({
		phaseIndex,
	}: {
		phaseIndex: number;
	}) => void;

	editingPlan: EditingPlan | null;
	editingPlanValue: SchedulePlan | null;
	setEditingPlan: (editing: EditingPlan | null) => void;
	handlePlanEditSave: ({ plan }: { plan: SchedulePlan }) => void;

	isPending: boolean;
	handleSubmit: () => void;
	handleInvoiceSubmit: (params: SendInvoiceSubmitParams) => Promise<{
		stripeId: string | undefined;
		hostedInvoiceUrl: string | null | undefined;
	}>;
	preview: BillingPreviewResponse | null | undefined;
	previewQuery: { data: BillingPreviewResponse | null | undefined };
	isPreviewLoading: boolean;
	error: Error | null;
	onScopeChange?: (entityId: string | undefined) => void;
}

const CreateScheduleFormReactContext =
	createContext<CreateScheduleFormContextValue | null>(null);

interface CreateScheduleFormProviderProps {
	customerId: string | undefined;
	entityId: string | undefined;
	nowMs?: number;
	initialValues?: CreateScheduleForm;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
	onScopeChange?: (entityId: string | undefined) => void;
	children: ReactNode;
}

export function CreateScheduleFormProvider({
	customerId,
	entityId,
	nowMs: nowMsProp,
	initialValues,
	onCheckoutRedirect,
	onSuccess,
	onScopeChange,
	children,
}: CreateScheduleFormProviderProps) {
	const [nowMsFallback] = useState(Date.now);
	const nowMs = nowMsProp ?? nowMsFallback;
	const form = useCreateScheduleForm({ initialValues });
	const { features } = useFeaturesQuery();
	const { products } = useProductsQuery();
	const [editingPlan, setEditingPlan] = useState<EditingPlan | null>(null);

	const formValues = useStore(form.store, (state) => state.values);
	const isDirty = useStore(form.store, (state) => state.isDirty);
	const isExistingSchedule = useMemo(
		() => hasPersistedCreateSchedule({ phases: formValues.phases }),
		[formValues.phases],
	);

	const { customer } = useCusQuery();
	const fullCustomer = customer as FullCustomer | null;

	// Mirrors the attach flow: a brand-new Stripe subscription is created when the
	// (scoped) customer has no active/trialing subscription. Only then can the
	// immediate phase be backdated (the server enforces the same rule).
	const hasActiveSubscription = useMemo(() => {
		const cusProducts = (fullCustomer?.customer_products ??
			[]) as FullCusProduct[];
		return cusProducts.some((cusProduct) => {
			const activeOrTrialing =
				ACTIVE_STATUSES.includes(cusProduct.status) ||
				cusProduct.status === CusProductStatus.Trialing;
			if (!activeOrTrialing) return false;
			if (!cusProduct.subscription_ids?.length) return false;
			const entityMatches = entityId
				? cusProduct.entity_id === entityId ||
					cusProduct.internal_entity_id === entityId
				: !cusProduct.internal_entity_id;
			return entityMatches;
		});
	}, [fullCustomer?.customer_products, entityId]);

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
		!isExistingSchedule &&
		!hasActiveSubscription &&
		immediatePlansPaidRecurring;

	const editingPlanValue = useMemo(() => {
		if (!editingPlan) return null;
		return (
			formValues.phases[editingPlan.phaseIndex]?.plans[editingPlan.planIndex] ??
			null
		);
	}, [editingPlan, formValues.phases]);

	const {
		isPhaseLocked,
		handleAddPhase,
		handleInsertPhase,
		handleRemovePhase,
		handleAddPlan,
		handleRemovePlan,
		handleCopyFromPreviousPhase,
		handlePlanEditSave,
	} = useSchedulePhaseHandlers({ form, nowMs, editingPlan, setEditingPlan });

	const getPhases = useCallback(
		() => form.store.state.values.phases,
		[form.store],
	);

	const getBillingBehavior = useCallback(
		() => form.store.state.values.billingBehavior ?? null,
		[form.store],
	);

	const getResetBillingCycle = useCallback(
		() => form.store.state.values.resetBillingCycle ?? false,
		[form.store],
	);

	const getEnablePlanImmediately = useCallback(
		() => form.store.state.values.enablePlanImmediately ?? false,
		[form.store],
	);

	const getAllowFirstPhaseBackdate = useCallback(
		() => allowFirstPhaseBackdate,
		[allowFirstPhaseBackdate],
	);

	const buildRequestBody = useBuildCreateScheduleRequestBody({
		customerId,
		entityId,
		products,
		features,
		nowMs,
		getPhases,
		getBillingBehavior,
		getResetBillingCycle,
		getEnablePlanImmediately,
		getAllowFirstPhaseBackdate,
	});

	const previewRequestBody = useCreateScheduleRequestBody({
		customerId,
		entityId,
		phases: isDirty ? formValues.phases : [],
		products,
		features,
		nowMs,
		billingBehavior: formValues.billingBehavior,
		resetBillingCycle: formValues.resetBillingCycle,
		allowFirstPhaseBackdate,
	});

	// When backdating is no longer allowed (e.g. plan changed to free, or scope
	// switched to one with an active subscription), drop a stale past start so it
	// can't leak into the request — the first phase falls back to "now".
	useEffect(() => {
		if (allowFirstPhaseBackdate || isExistingSchedule) return;
		if (form.store.state.values.phases[0]?.startsAt != null) {
			form.setFieldValue("phases[0].startsAt", null);
		}
	}, [allowFirstPhaseBackdate, isExistingSchedule, form]);

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
	} = useCreateSchedulePreview({ requestBody: previewRequestBody });

	const { handleSubmit, handleInvoiceSubmit, isPending } =
		useCreateScheduleMutation({
			customerId,
			buildRequestBody,
			onCheckoutRedirect,
			onSuccess,
		});

	const previewQuery = useMemo(() => ({ data: preview }), [preview]);

	const value = useMemo<CreateScheduleFormContextValue>(
		() => ({
			form,
			formValues,
			customerId,
			entityId,
			nowMs,
			products,
			features,
			isExistingSchedule,
			allowFirstPhaseBackdate,
			isPhaseLocked,
			handleAddPhase,
			handleInsertPhase,
			handleRemovePhase,
			handleAddPlan,
			handleRemovePlan,
			handleCopyFromPreviousPhase,
			editingPlan,
			editingPlanValue,
			setEditingPlan,
			handlePlanEditSave,
			isPending,
			handleSubmit,
			handleInvoiceSubmit,
			preview,
			previewQuery,
			isPreviewLoading,
			error: phaseTimingError ? new Error(phaseTimingError) : previewError,
			onScopeChange,
		}),
		[
			form,
			formValues,
			customerId,
			entityId,
			nowMs,
			products,
			features,
			isExistingSchedule,
			allowFirstPhaseBackdate,
			isPhaseLocked,
			handleAddPhase,
			handleInsertPhase,
			handleRemovePhase,
			handleAddPlan,
			handleRemovePlan,
			handleCopyFromPreviousPhase,
			editingPlan,
			editingPlanValue,
			setEditingPlan,
			handlePlanEditSave,
			isPending,
			handleSubmit,
			handleInvoiceSubmit,
			preview,
			previewQuery,
			isPreviewLoading,
			phaseTimingError,
			previewError,
			onScopeChange,
		],
	);

	return (
		<CreateScheduleFormReactContext.Provider value={value}>
			{children}
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

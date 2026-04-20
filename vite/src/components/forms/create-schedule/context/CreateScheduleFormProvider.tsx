import type {
	BillingPreviewResponse,
	Feature,
	ProductV2,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import type { SendInvoiceSubmitParams } from "@/components/forms/shared/SendInvoiceStage";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
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
		handlePlanEditSave,
	} = useSchedulePhaseHandlers({ form, nowMs, editingPlan, setEditingPlan });

	const getPhases = useCallback(
		() => form.store.state.values.phases,
		[form.store],
	);

	const buildRequestBody = useBuildCreateScheduleRequestBody({
		customerId,
		entityId,
		products,
		features,
		nowMs,
		getPhases,
	});

	const previewRequestBody = useCreateScheduleRequestBody({
		customerId,
		entityId,
		phases: isDirty ? formValues.phases : [],
		products,
		features,
		nowMs,
	});

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
			isPhaseLocked,
			handleAddPhase,
			handleInsertPhase,
			handleRemovePhase,
			handleAddPlan,
			handleRemovePlan,
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
			isPhaseLocked,
			handleAddPhase,
			handleInsertPhase,
			handleRemovePhase,
			handleAddPlan,
			handleRemovePlan,
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

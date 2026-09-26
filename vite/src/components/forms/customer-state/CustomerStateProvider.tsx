import type { Feature, ProductV2 } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";
import type {
	CustomerStateForm,
	CustomerStatePlan,
	PlanLocation,
} from "@/components/forms/customer-state/customerStateSchema";
import type { UseCustomerStateForm } from "@/components/forms/customer-state/useCustomerStateForm";
import { useCustomerStateHandlers } from "@/components/forms/customer-state/useCustomerStateHandlers";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";

type CustomerStateHandlers = ReturnType<typeof useCustomerStateHandlers>;

type CustomerStateContextValue = CustomerStateHandlers & {
	form: UseCustomerStateForm;
	formValues: CustomerStateForm;
	nowMs: number;
	products: ProductV2[];
	features: Feature[];
	/** The customer's active plans, offered as a starting point for phase one. */
	existingPlans: CustomerStatePlan[];
	canMakeUnscheduled: boolean;
	/** Renders editable seat totals under each plan's licenses. */
	showLicenseQuantities: boolean;
	/** Why a plan has no Stripe item after the sync; empty when it does. */
	planNotFoundReasons: (location: PlanLocation) => string[];
	editingPlan: PlanLocation | null;
	editingPlanValue: CustomerStatePlan | null;
	setEditingPlan: (editing: PlanLocation | null) => void;
};

const CustomerStateContext = createContext<CustomerStateContextValue | null>(
	null,
);

const NO_EXISTING_PLANS: CustomerStatePlan[] = [];
const NO_NOT_FOUND_REASONS: string[] = [];
const NEVER_NOT_FOUND = () => NO_NOT_FOUND_REASONS;

/**
 * The customer's plans across phases, plus the row handlers that edit them.
 * Set plans and sync both render this state; they differ only in how it's
 * seeded and where it's submitted.
 */
export function CustomerStateProvider({
	form,
	nowMs,
	existingPlans = NO_EXISTING_PLANS,
	canMakeUnscheduled,
	showLicenseQuantities = false,
	planNotFoundReasons = NEVER_NOT_FOUND,
	children,
}: {
	form: UseCustomerStateForm;
	nowMs: number;
	existingPlans?: CustomerStatePlan[];
	canMakeUnscheduled: boolean;
	showLicenseQuantities?: boolean;
	planNotFoundReasons?: (location: PlanLocation) => string[];
	children: ReactNode;
}) {
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();
	const formValues = useStore(form.store, (state) => state.values);
	const [editingPlan, setEditingPlan] = useState<PlanLocation | null>(null);

	const editingPlanValue = useMemo(() => {
		if (!editingPlan) return null;
		if (editingPlan.location === "unscheduled") {
			return formValues.unscheduledPlans[editingPlan.planIndex] ?? null;
		}
		return (
			formValues.phases[editingPlan.phaseIndex]?.plans[editingPlan.planIndex] ??
			null
		);
	}, [editingPlan, formValues.phases, formValues.unscheduledPlans]);

	const handlers = useCustomerStateHandlers({
		form,
		nowMs,
		products,
		editingPlan,
		setEditingPlan,
		existingPlans,
	});

	const value = useMemo<CustomerStateContextValue>(
		() => ({
			...handlers,
			form,
			formValues,
			nowMs,
			products,
			features,
			existingPlans,
			canMakeUnscheduled,
			showLicenseQuantities,
			planNotFoundReasons,
			editingPlan,
			editingPlanValue,
			setEditingPlan,
		}),
		[
			handlers,
			form,
			formValues,
			nowMs,
			products,
			features,
			existingPlans,
			canMakeUnscheduled,
			showLicenseQuantities,
			planNotFoundReasons,
			editingPlan,
			editingPlanValue,
		],
	);

	return (
		<CustomerStateContext.Provider value={value}>
			{children}
		</CustomerStateContext.Provider>
	);
}

export function useCustomerStateContext(): CustomerStateContextValue {
	const context = useContext(CustomerStateContext);
	if (!context) {
		throw new Error(
			"useCustomerStateContext must be used within CustomerStateProvider",
		);
	}
	return context;
}

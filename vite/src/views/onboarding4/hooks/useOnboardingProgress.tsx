import type { FullCustomer, ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { create } from "zustand";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const REFETCH_INTERVAL = 5000;
const DISMISSED_STORAGE_KEY = "autumn_products_onboarding_dismissed";

export type OnboardingStepId = "plans" | "customer" | "payments" | "usage";

interface OnboardingStepStatus {
	complete: boolean;
}

interface OnboardingDismissedState {
	isDismissed: boolean;
	dismiss: () => void;
	show: () => void;
}

const useOnboardingDismissedStore = create<OnboardingDismissedState>()(
	(set) => ({
		isDismissed:
			typeof window !== "undefined"
				? localStorage.getItem(DISMISSED_STORAGE_KEY) === "true"
				: false,
		dismiss: () => {
			localStorage.setItem(DISMISSED_STORAGE_KEY, "true");
			set({ isDismissed: true });
		},
		show: () => {
			localStorage.removeItem(DISMISSED_STORAGE_KEY);
			set({ isDismissed: false });
		},
	}),
);

/** Use this when you only need to show/dismiss without fetching progress data */
export const useOnboardingVisibility = () => useOnboardingDismissedStore();

interface OnboardingProgress {
	steps: Record<OnboardingStepId, OnboardingStepStatus>;
	currentStep: OnboardingStepId;
	isLoading: boolean;
	isDismissed: boolean;
	dismiss: () => void;
	show: () => void;
}

/**
 * Hook to track onboarding progress and determine the current step.
 * Polls for incomplete steps every 5 seconds and stops polling once complete.
 */
export const useOnboardingProgress = (): OnboardingProgress => {
	const axiosInstance = useAxiosInstance();
	const { isDismissed, dismiss, show } = useOnboardingDismissedStore();

	// Products query
	const { data: productsData, isLoading: productsLoading } = useQuery<{
		products: ProductV2[];
	}>({
		queryKey: ["onboarding-products"],
		queryFn: async () => {
			const { data } = await axiosInstance.get("/products/products");
			return data;
		},
		refetchInterval: (query) => {
			const hasValidProduct = query.state.data?.products?.some((p) => {
				const items = p.items ?? [];
				const hasPrice = items.some((i) => i.price != null || i.tiers != null);
				const hasFeature = items.some((i) => i.feature_id != null);
				return hasPrice && hasFeature;
			});
			return hasValidProduct ? false : REFETCH_INTERVAL;
		},
	});

	// Customers query
	const { data: customersData, isLoading: customersLoading } = useQuery<{
		fullCustomers: FullCustomer[];
	}>({
		queryKey: ["onboarding-customers"],
		queryFn: async () => {
			const { data } = await axiosInstance.post(
				"/customers/all/full_customers",
				{ page_size: 50 },
			);
			return data;
		},
		refetchInterval: (query) => {
			const hasCustomers = (query.state.data?.fullCustomers?.length ?? 0) > 0;
			return hasCustomers ? false : REFETCH_INTERVAL;
		},
	});

	// Payments query (checking for Stripe ID)
	const { data: paymentsData, isLoading: paymentsLoading } = useQuery<{
		fullCustomers: FullCustomer[];
	}>({
		queryKey: ["onboarding-payments"],
		queryFn: async () => {
			const { data } = await axiosInstance.post(
				"/customers/all/full_customers",
				{ page_size: 50 },
			);
			return data;
		},
		refetchInterval: (query) => {
			const hasStripeCustomer = query.state.data?.fullCustomers?.some(
				(c) => c.processor?.id,
			);
			return hasStripeCustomer ? false : REFETCH_INTERVAL;
		},
	});

	// Events query
	const { data: eventsData, isLoading: eventsLoading } = useQuery<{
		rawEvents: { data: unknown[] };
	}>({
		queryKey: ["onboarding-events"],
		queryFn: async () => {
			const { data } = await axiosInstance.post("/query/raw", {
				customer_id: null,
				interval: "30d",
			});
			return data;
		},
		refetchInterval: (query) => {
			const hasEvents = (query.state.data?.rawEvents?.data?.length ?? 0) > 0;
			return hasEvents ? false : REFETCH_INTERVAL;
		},
	});

	// Compute completion status directly from query data
	const completedSteps = useMemo(
		() => ({
			plans:
				productsData?.products?.some((p) => {
					const items = p.items ?? [];
					const hasPrice = items.some(
						(i) => i.price != null || i.tiers != null,
					);
					const hasFeature = items.some((i) => i.feature_id != null);
					return hasPrice && hasFeature;
				}) ?? false,
			customer: (customersData?.fullCustomers?.length ?? 0) > 0,
			payments:
				paymentsData?.fullCustomers?.some((c) => c.processor?.id) ?? false,
			usage: (eventsData?.rawEvents?.data?.length ?? 0) > 0,
		}),
		[productsData, customersData, paymentsData, eventsData],
	);

	const currentStep = useMemo((): OnboardingStepId => {
		if (!completedSteps.plans) return "plans";
		if (!completedSteps.customer) return "customer";
		if (!completedSteps.payments) return "payments";
		if (!completedSteps.usage) return "usage";
		return "plans";
	}, [completedSteps]);

	const isLoading =
		productsLoading || customersLoading || paymentsLoading || eventsLoading;

	return {
		steps: {
			plans: { complete: completedSteps.plans },
			customer: { complete: completedSteps.customer },
			payments: { complete: completedSteps.payments },
			usage: { complete: completedSteps.usage },
		},
		currentStep,
		isLoading,
		isDismissed,
		dismiss,
		show,
	};
};
